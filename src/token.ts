/**
 * @author pastakhov, MusikAnimal, Bhsd and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {Tag} from '@lezer/highlight';
import {decodeHTML, getRegex} from '@bhsd/common';
import {otherParserFunctions} from '@bhsd/common/dist/cm';
import {htmlTags, voidHtmlTags, selfClosingTags, tokenTable, tokens} from './config';
import * as plugins from './plugins';
import type {MwConfig as MwConfigBase} from '@bhsd/common/dist/cm';
import type {EditorState} from '@codemirror/state';
import type {StreamParser, StringStream as StringStreamBase} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';

declare type MimeTypes = 'mediawiki'
	| 'text/mediawiki'
	| 'text/nowiki'
	| 'text/pre'
	| 'text/references'
	| 'text/choose'
	| 'text/combobox'
	| 'text/inputbox'
	| 'text/gallery';
declare type Style = string | [string];
declare type Tokenizer<T = Style> = ((stream: StringStream, state: State) => T) & {args?: unknown[]};
declare type NestCount = 'nTemplate' | 'nExt' | 'nVar' | 'nLink' | 'nExtLink';
declare interface Nesting extends Record<NestCount, number> {
	extName: string | false;
	extState: object | false;
}
declare interface State extends Nesting {
	tokenize: Tokenizer;
	readonly stack: Tokenizer[];
	readonly inHtmlTag: string[];
	extMode: StreamParser<object> | false;
	lbrack: boolean | undefined;
	bold: boolean;
	italic: boolean;
	dt: Partial<Nesting> & {n: number, html: number};
	sof: boolean;
	redirect: {colon: boolean} | false;
	imgLink: boolean;
	data: MediaWikiData;
}
declare type ExtState = Omit<State, 'dt'> & Partial<Pick<State, 'dt'>>;
declare interface Token {
	pos: number;
	readonly string: string;
	style: Style;
	readonly state: State;
}
declare interface StringStream extends StringStreamBase {
	match(pattern: string, consume?: boolean, caseInsensitive?: boolean): true | null;
	match(pattern: RegExp, consume?: boolean): RegExpMatchArray | null;
}

export type TagName = keyof typeof tokens;
export type ApiSuggestions = [string, string?][];

/**
 * 获取维基链接建议
 * @param search 搜索字符串，开头不包含` `
 * @param namespace 命名空间
 * @param subpage 是否为子页面
 */
export type ApiSuggest = (search: string, namespace?: number, subpage?: boolean) =>
	ApiSuggestions | Promise<ApiSuggestions>;

export interface MwConfig extends MwConfigBase {
	nsid: Record<string, number>;
	functionHooks?: string[];
	variants?: string[];
	img?: Record<string, string>;
	redirection?: string[];
	permittedHtmlTags?: string[];
	implicitlyClosedHtmlTags?: string[];
	linkSuggest?: ApiSuggest;
	paramSuggest?: ApiSuggest;
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	titleParser?: (state: EditorState, node: SyntaxNode) => string | undefined;
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	isbnParser?: (link: string) => string;
}

class MediaWikiData {
	/** 已解析的节点 */
	declare readonly readyTokens: Token[];

	/** 当前起始位置 */
	declare oldToken: Token | null;

	/** 可能需要回滚的`'''` */
	declare mark: number | null;

	declare firstSingleLetterWord: number | null;
	declare firstMultiLetterWord: number | null;
	declare firstSpace: number | null;
	declare readonly tags;

	constructor(tags: string[]) {
		this.tags = tags;
		this.firstSingleLetterWord = null;
		this.firstMultiLetterWord = null;
		this.firstSpace = null;
		this.readyTokens = [];
		this.oldToken = null;
		this.mark = null;
	}
}

/**
 * 比较两个嵌套状态是否相同
 * @param a
 * @param b
 * @param shallow 是否浅比较
 */
const cmpNesting = (a: Partial<Nesting>, b: Nesting, shallow?: boolean): boolean =>
	a.nTemplate === b.nTemplate
	&& a.nExt === b.nExt
	&& a.nVar === b.nVar
	&& a.nLink === b.nLink
	&& a.nExtLink === b.nExtLink
	&& a.extName === b.extName
	&& (shallow || a.extName !== 'mediawiki' || cmpNesting(a.extState as Partial<Nesting>, b.extState as Nesting));

/**
 * 浅复制嵌套状态
 * @param a
 * @param b
 */
const copyNesting = (a: Partial<Nesting>, b: Nesting): void => {
	a.nTemplate = b.nTemplate;
	a.nExt = b.nExt;
	a.nVar = b.nVar;
	a.nLink = b.nLink;
	a.nExtLink = b.nExtLink;
	a.extName = b.extName;
};

const simpleToken: Tokenizer<string> = (stream, state): string => {
	const style = state.tokenize(stream, state);
	return Array.isArray(style) ? style[0] : style;
};

const startState = (tokenize: Tokenizer, tags: string[], sof = false): State => ({
	tokenize,
	stack: [],
	inHtmlTag: [],
	extName: false,
	extMode: false,
	extState: false,
	nTemplate: 0,
	nExt: 0,
	nVar: 0,
	nLink: 0,
	nExtLink: 0,
	lbrack: false,
	bold: false,
	italic: false,
	dt: {n: 0, html: 0},
	sof,
	redirect: false,
	imgLink: false,
	data: new MediaWikiData(tags),
});

/**
 * 复制 StreamParser 状态
 * @param state
 */
const copyState = (state: State): State => {
	const result = {...state};
	for (const [key, val] of Object.entries(state)) {
		if (Array.isArray(val)) {
			// @ts-expect-error initial value
			result[key] = [...val];
		} else if (key === 'extState') {
			result[key] = (state.extName && state.extMode && state.extMode.copyState || copyState)(val as State);
		} else if (key !== 'data' && val && typeof val === 'object') {
			// @ts-expect-error initial value
			result[key] = {...val}; // eslint-disable-line @typescript-eslint/no-misused-spread
		}
	}
	return result;
};

/**
 * 判断字符串是否为 HTML 实体
 * @param str 字符串
 */
const isHtmlEntity = (str: string): boolean =>
	// eslint-disable-next-line @typescript-eslint/no-misused-spread
	typeof document !== 'object' || str.startsWith('#') || [...decodeHTML(`&${str}`)].length === 1;

/**
 * 更新内部 Tokenizer
 * @param state
 * @param tokenizer
 */
const chain = (state: State, tokenizer: Tokenizer): void => {
	state.stack.unshift(state.tokenize);
	state.tokenize = tokenizer;
};

/**
 * 更新内部 Tokenizer
 * @param state
 */
const pop = (state: State): void => {
	state.tokenize = state.stack.shift()!;
};

/**
 * 是否为行首语法
 * @param stream
 * @param table 是否允许表格
 * @param file 是否为文件
 */
const isSolSyntax = (stream: StringStream, table?: boolean, file?: boolean): unknown =>
	stream.sol() && (
		table && stream.match(/^\s*(?::+\s*)?\{\|/u, false)
		|| stream.match(/^(?:-{4}|=)/u, false)
		|| !file && /[*#;:]/u.test(stream.peek() || '')
	);

/**
 * 获取负向先行断言
 * @param chars
 * @param comment 是否仅排除注释
 */
const lookahead = (chars: string, comment?: boolean | State): string => {
	const table = {
		"'": "'(?!')",
		'{': String.raw`\{(?!\{)`,
		'}': String.raw`\}(?!\})`,
		'<': comment ? '<(?!!--)' : '<(?!!--|/?[a-z])',
		'~': '~~?(?!~)',
		_: '_(?!_)',
		'[': String.raw`\[(?!\[)`,
		']': String.raw`\](?!\])`,
		'/': '/(?!>)',
		'-': String.raw`-(?!\{(?!\{))`,
	};
	if (typeof comment === 'object') {
		const {data: {tags}} = comment;
		table['<'] = String.raw`<(?!!--${tags.includes('onlyinclude') ? '|onlyinclude>' : ''}|(?:${
			tags.filter(tag => tag !== 'onlyinclude').join('|')
		})(?:[\s/>]|$))`;
	}
	// eslint-disable-next-line @typescript-eslint/no-misused-spread
	return [...chars].map(ch => table[ch as keyof typeof table]).join('|');
};

/**
 * 是否需要检查冒号
 * @param state
 */
const needColon = (state: State): boolean => {
	const {dt} = state;
	return Boolean(dt.n) && dt.html === 0 && !state.bold && !state.italic && cmpNesting(dt, state, true);
};

/**
 * 获取外部链接正则表达式
 * @param punctuations 标点符号
 */
const getUrlRegex = (punctuations = ''): string => {
	const chars = "~{'";
	return String.raw`[^&${chars}\p{Zs}[\]<>"${punctuations}]|&(?![lg]t;)|${lookahead(chars)}`;
};

/**
 * 获取标点符号
 * @param lpar 是否包含左括号
 */
const getPunctuations = (lpar?: boolean): string => String.raw`.,;:!?\\${lpar ? '' : ')'}`;

const getTokenizer = <T = Style>(
	method: (...args: any[]) => Tokenizer<T>,
	context: ClassMethodDecoratorContext | ClassGetterDecoratorContext,
) =>
	function(this: MediaWiki, ...args: any[]): Tokenizer<T> {
		const tokenizer = method.apply(this, args);
		Object.defineProperty(tokenizer, 'name', {value: context.name});
		tokenizer.args = args;
		return tokenizer;
	};

const makeFullStyle = (style: Style, state: ExtState): string => (
	typeof style === 'string'
		? style
		: `${style[0]} ${state.bold || state.dt?.n ? tokens.strong : ''} ${state.italic ? tokens.em : ''}`
).trim().replace(/\s{2,}/gu, ' ') || ' ';

const makeLocalStyle = (style: string, state: ExtState, endGround?: NestCount): string => {
	let ground = '';
	switch (state.nTemplate) {
		case 0:
			break;
		case 1:
			ground += '-template';
			break;
		case 2:
			ground += '-template2';
			break;
		default:
			ground += '-template3';
			break;
	}
	switch (state.nExt) {
		case 0:
			break;
		case 1:
			ground += '-ext';
			break;
		case 2:
			ground += '-ext2';
			break;
		default:
			ground += '-ext3';
			break;
	}
	if (state.nLink || state.nExtLink) {
		ground += '-link';
	}
	if (endGround) {
		state[endGround]--;
		const {dt} = state;
		if (dt?.n && state[endGround] < dt[endGround]!) {
			dt.n = 0;
		}
	}
	return (ground && `mw${ground}-ground `) + style;
};

const makeLocalTagStyle = (tag: TagName, state: State, endGround?: NestCount): string =>
	makeLocalStyle(tokens[tag], state, endGround);

const makeStyle = (style: string, state: ExtState, endGround?: NestCount): [string] =>
	[makeLocalStyle(style, state, endGround)];

const makeTagStyle = (tag: TagName, state: State, endGround?: NestCount): [string] =>
	makeStyle(tokens[tag], state, endGround);

/**
 * Remembers position and status for rollbacking.
 * It is needed for changing from bold to italic with apostrophes before it, if required.
 *
 * @see https://phabricator.wikimedia.org/T108455
 * @param stream
 * @param state
 */
const prepareItalicForCorrection = (stream: StringStream, state: State): void => {
	// See Parser::doQuotes() in MediaWiki Core, it works similarly.
	// firstSingleLetterWord has maximum priority
	// firstMultiLetterWord has medium priority
	// firstSpace has low priority
	const end = stream.pos,
		str = stream.string.slice(0, end - 3),
		x1 = str.slice(-1),
		x2 = str.slice(-2, -1),
		{data} = state;
	// firstSingleLetterWord always is undefined here
	if (x1 === ' ') {
		if (data.firstMultiLetterWord || data.firstSpace) {
			return;
		}
		data.firstSpace = end;
	} else if (x2 === ' ') {
		data.firstSingleLetterWord = end;
	} else if (data.firstMultiLetterWord) {
		return;
	} else {
		data.firstMultiLetterWord = end;
	}
	data.mark = end;
};

/**
 * 获取`|`的正则表达式
 * @param isTemplate 是否在模板中
 */
const getPipe = (isTemplate: boolean): string =>
	String.raw`${isTemplate ? '' : String.raw`\||`}\{(?:\{\s*|\s*\()!\s*\}\}`;

const syntaxHighlight = new Set(['syntaxhighlight', 'source', 'pre']),
	pageFunctions = new Set<string | undefined>([
		'filepath',
		'localurl',
		'localurle',
		'fullurl',
		'fullurle',
		'canonicalurl',
		'canonicalurle',
		'int',
		'msgnw',
	]),
	headerRegex = new RegExp(`^(?:[^&[<{~'-]|${lookahead("<{~'-")})+`, 'iu'),
	templateRegex = new RegExp(`^(?:[^|{}<]|${lookahead('{}<', true)})+`, 'u'),
	argumentRegex = new RegExp(`^(?:[^|[&:}{<~'_-]|${lookahead("}{<~'_-")})+`, 'iu'),
	styleRegex = new RegExp(`^(?:[^|[&}{<~'_-]|${lookahead("}{<~'_-")})+`, 'iu'),
	convertRegex = new RegExp(
		String.raw`^(?:[^};&='{[<~_-]|\}(?!-)|=(?!>)|${lookahead("'{[<~_-")})+`,
		'u',
	),
	wikiRegex = new RegExp(`^(?:[^&'{[<~_:-]|${lookahead("'{[<~_-")})+`, 'u'),
	tableDefinitionRegex = new RegExp(`^(?:[^&={</]|${lookahead('{</')})+`, 'iu'),
	extLinkChars = "[{'<-",
	tableDefinitionChars = '{<',
	tableCellChars = "'<~_{-",
	htmlAttrChars = '{/',
	freeRegex = [false, true].map(lpar => {
		const punctuations = getPunctuations(lpar),
			source = getUrlRegex(punctuations);
		return new RegExp(`^(?:${source}|[${punctuations}]+(?=${source}))*`, 'u');
	}) as [RegExp, RegExp],
	indentedTableRegex = [false, true].map(
		isTemplate => new RegExp(String.raw`^:*\s*(?=\{(?:${getPipe(isTemplate)}))`, 'u'),
	) as [RegExp, RegExp],
	tableRegex = [false, true]
		.map(isTemplate => new RegExp(String.raw`^(?:${getPipe(isTemplate)})\s*`, 'u')) as [RegExp, RegExp],
	spacedTableRegex = [false, true].map(
		isTemplate => new RegExp(String.raw`^\s*(:+\s*)?(?=\{(?:${getPipe(isTemplate)}))`, 'u'),
	) as [RegExp, RegExp],
	linkTextRegex = [false, true].map(file => {
		const chars = `]'{<${file ? '~' : '['}-`;
		return new RegExp(`^(?:[^&${file ? '[|' : ''}\\${chars}]|${lookahead(chars)})+`, 'iu');
	}) as [RegExp, RegExp],
	tableDefinitionValueRegex = ['', '='].map(equal => new RegExp(
		String.raw`^(?:[^\s&${tableDefinitionChars}${equal}]|${lookahead(tableDefinitionChars)})+`,
		'iu',
	)) as [RegExp, RegExp],
	variableRegex = [false, true].map(
		isDefault => new RegExp(String.raw`^(?:[^|{}<${isDefault ? "[&~'_:-" : ''}]|\}(?!\}\})|${
			isDefault ? lookahead("{<~'_-") : lookahead('{<', true)
		})+`, 'iu'),
	) as [RegExp, RegExp],
	parserFunctionRegex = ['', '[&', '[&:'].map(
		s => getRegex(chars => new RegExp(`^(?:[^|${s}${chars}]|${lookahead(chars)})+`, 'iu')),
	),
	getExtLinkTextRegex = getRegex(
		pipe => new RegExp(String.raw`^(?:[^\]&${pipe}${extLinkChars}]|${lookahead(extLinkChars)})+`, 'iu'),
	),
	getExtLinkRegex = getRegex(pipe => new RegExp(`^(?:${getUrlRegex(pipe)})+`, 'u')),
	getTableDefinitionRegex = getRegex(s => new RegExp(
		`^(?:[^&${tableDefinitionChars}${s}]|${lookahead(tableDefinitionChars)})+`,
		'iu',
	)),
	getTableCellRegex = getRegex(
		s => new RegExp(`^(?:[^[&${s}${tableCellChars}]|${lookahead(tableCellChars)})+`, 'iu'),
	),
	getHtmlAttrRegex = getRegex(
		s => new RegExp(`^(?:[^<>&${htmlAttrChars}${s}]|${lookahead(htmlAttrChars)})+`, 'u'),
	),
	getHtmlAttrKeyRegex = getRegex(
		pipe => new RegExp(`^(?:[^<>&={/${pipe}]|${lookahead('{/')})+`, 'u'),
	),
	getExtAttrRegex = getRegex(s => new RegExp(`^(?:[^>/${s}]|${lookahead('/')})+`, 'u')),
	getExtTagCloseRegex = getRegex(
		name => new RegExp(`</${name}${name === 'onlyinclude' ? '>' : String.raw`\s*(?:>|$)`}`, 'iu'),
	),
	getNestedRegex = getRegex(tag => new RegExp(String.raw`^(?:[^<]|<(?!${tag}(?:[\s/>]|$)))+`, 'iu'));

/** Adapted from the original CodeMirror 5 stream parser by Pavel Astakhov */
export class MediaWiki {
	declare readonly config;
	declare readonly tokenTable;
	declare readonly hiddenTable: Record<string, Tag>;
	declare readonly permittedHtmlTags;
	declare readonly implicitlyClosedHtmlTags;
	declare readonly urlProtocols;
	declare readonly linkRegex;
	declare readonly fileRegex;
	declare readonly redirectRegex;
	declare readonly img;
	declare readonly imgRegex;
	declare readonly convertSemicolon;
	declare readonly convertLang;
	declare readonly tags;
	declare readonly hasVariants;
	declare readonly preRegex;
	declare readonly autocompleteNamespaces;

	constructor(config: MwConfig) {
		const {
			urlProtocols,
			permittedHtmlTags,
			implicitlyClosedHtmlTags,
			tags,
			nsid,
			variants,
			redirection = ['#REDIRECT'],
			img = {},
		} = config;
		this.config = config;
		this.tokenTable = {...tokenTable};
		this.hiddenTable = {};
		this.permittedHtmlTags = new Set<string | undefined>([
			...htmlTags,
			...permittedHtmlTags ?? [],
		]);
		this.implicitlyClosedHtmlTags = new Set([
			...voidHtmlTags,
			...implicitlyClosedHtmlTags ?? [],
		]);
		this.urlProtocols = new RegExp(String.raw`^(?:${urlProtocols})(?=[^\p{Zs}[\]<>"])`, 'iu');
		this.linkRegex = new RegExp(String.raw`^\[(?!${urlProtocols})\s*`, 'iu');
		this.fileRegex = new RegExp(
			String.raw`^(?:${
				Object.entries(nsid).filter(([, id]) => id === 6).map(([ns]) => ns).join('|')
			})\s*:`,
			'iu',
		);
		this.redirectRegex = new RegExp(
			String.raw`^\s*(?:${redirection.join('|')})(\s*:)?\s*(?=\[\[|$)`,
			'iu',
		);
		this.img = Object.keys(img).filter(word => !/\$1./u.test(word));
		this.imgRegex = new RegExp(
			String.raw`^(?:${
				this.img.filter(word => word.endsWith('$1')).map(word => word.slice(0, -2))
					.join('|')
			}|(?:${
				this.img.filter(word => !word.endsWith('$1')).join('|')
			}|(?:\d+x?|\d*x\d+)\s*(?:px)?px)\s*(?=\||\]\]|$))`,
			'u',
		);
		this.tags = [...Object.keys(tags), 'includeonly', 'noinclude', 'onlyinclude'];
		this.convertSemicolon = variants && new RegExp(
			String.raw`^;\s*(?=(?:[^;]*?=>\s*)?(?:${variants.join('|')})\s*:|(?:$|\}-))`,
			'u',
		);
		this.convertLang = variants
			&& new RegExp(String.raw`^(?:=>\s*)?(?:${variants.join('|')})\s*:`, 'u');
		this.hasVariants = Boolean(variants?.length);
		this.preRegex = [false, true].map(
			begin => new RegExp(String.raw`^(?:[^<&-]|-${
				this.hasVariants ? String.raw`(?!\{)` : ''
			}|<(?!${begin ? '/' : ''}nowiki>))+`, 'iu'),
		) as [RegExp, RegExp];
		this.autocompleteNamespaces = {
			0: '',
			6: 'File:',
			8: 'MediaWiki:',
			10: 'Template:',
			274: 'Widget:',
			828: 'Module:',
		};
		this.registerGroundTokens();
	}

	/**
	 * Dynamically register a token in CodeMirror.
	 * This is solely for use by this.addTag() and CodeMirrorModeMediaWiki.makeLocalStyle().
	 *
	 * @param token
	 * @param hidden Whether the token is not highlighted
	 * @param parent
	 */
	addToken(token: string, hidden = false, parent?: Tag): void {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		this[hidden ? 'hiddenTable' : 'tokenTable'][`mw-${token}`] ??= Tag.define(parent);
	}

	/**
	 * Register the ground tokens. These aren't referenced directly in the StreamParser, nor do
	 * they have a parent Tag, so we don't need them as constants like we do for other tokens.
	 * See makeLocalStyle() for how these tokens are used.
	 */
	registerGroundTokens(): void {
		const grounds = [
			'ext',
			'ext-link',
			'ext2',
			'ext2-link',
			'ext3',
			'ext3-link',
			'link',
			'template-ext',
			'template-ext-link',
			'template-ext2',
			'template-ext2-link',
			'template-ext3',
			'template-ext3-link',
			'template',
			'template-link',
			'template2-ext',
			'template2-ext-link',
			'template2-ext2',
			'template2-ext2-link',
			'template2-ext3',
			'template2-ext3-link',
			'template2',
			'template2-link',
			'template3-ext',
			'template3-ext-link',
			'template3-ext2',
			'template3-ext2-link',
			'template3-ext3',
			'template3-ext3-link',
			'template3',
			'template3-link',
		];
		for (const ground of grounds) {
			this.addToken(`${ground}-ground`);
		}
		for (let i = 1; i < 7; i++) {
			this.addToken(`section--${i}`);
		}
		for (const tag of this.tags) {
			this.addToken(`tag-${tag}`, tag !== 'nowiki' && tag !== 'pre');
			this.addToken(`ext-${tag}`, true);
		}
		for (const tag of this.permittedHtmlTags) {
			this.addToken(`html-${tag}`, true);
		}
		for (const i in this.autocompleteNamespaces) {
			if (Number.isInteger(Number(i))) {
				this.addToken(`function-${i}`, true);
			}
		}
	}

	@getTokenizer
	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	inChars({length}: string, tag: TagName): Tokenizer {
		return (stream, state) => {
			stream.pos += length;
			pop(state);
			return makeLocalTagStyle(tag, state);
		};
	}

	@getTokenizer
	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	inStr(str: string, tag: TagName | false, errorTag: TagName = 'error'): Tokenizer {
		return (stream, state) => {
			if (stream.match(str, Boolean(tag))) {
				pop(state);
				return tag ? makeLocalTagStyle(tag, state) : '';
			} else if (!stream.skipTo(str)) {
				stream.skipToEnd();
			}
			return makeLocalTagStyle(errorTag, state);
		};
	}

	@getTokenizer
	eatWikiText(style: string): Tokenizer {
		if (style in tokens) {
			style = tokens[style as TagName]; // eslint-disable-line no-param-reassign
		}
		const regex =
			/^(?:(?:RFC|PMID)[\p{Zs}\t]+\d+|ISBN[\p{Zs}\t]+(?:97[89][\p{Zs}\t-]?)?(?:\d[\p{Zs}\t-]?){9}[\dxX])\b/u;
		return (stream, state) => {
			let ch: string;
			if (stream.eol()) {
				return '';
			} else if (stream.sol()) {
				if (state.sof) {
					if (stream.match(/^\s+$/u)) {
						return '';
					}
					state.sof = false;
					const mt = stream.match(this.redirectRegex);
					if (mt) {
						state.redirect = {colon: !mt[1]};
						return tokens.redirect;
					}
				} else if (state.redirect) {
					if (stream.match(/^\s+(?=$|\[\[)/u)) {
						return '';
					} else if (state.redirect.colon && stream.match(/^\s*:\s*(?=$|\[\[)/u)) {
						state.redirect.colon = false;
						return tokens.redirect;
					}
					state.redirect = false;
				}
				if (stream.match('//')) {
					return makeStyle(style, state);
				} else if (stream.match(regex)) {
					return makeTagStyle('magicLink', state);
				}
				const mtFree = stream.match(this.urlProtocols, false);
				if (mtFree) {
					chain(state, this.eatExternalLinkProtocol(mtFree[0]));
					return '';
				}
				ch = stream.next()!;
				const isTemplate = ['inTemplateArgument', 'inParserFunctionArgument', 'inVariable']
					.includes(state.tokenize.name);
				switch (ch) {
					case '#':
					case ';':
					case '*':
						stream.backUp(1);
						return this.eatList(stream, state);
					case ':':
						// Highlight indented tables :{|, bug T108454
						if (stream.match(indentedTableRegex[isTemplate ? 1 : 0])) {
							chain(state, this.eatStartTable);
							return makeLocalTagStyle('list', state);
						}
						return this.eatList(stream, state);
					case '=': {
						const tmp = stream
							.match(/^(={0,5})(.+?(=\1\s*)(?:<!--(?!.*-->\s*\S).*)?)$/u);
						// Title
						if (tmp) {
							stream.backUp(tmp[2]!.length);
							chain(state, this.inSectionHeader(tmp[3]!));
							return makeLocalStyle(
								`${tokens.sectionHeader} mw-section--${tmp[1]!.length + 1}`,
								state,
							);
						}
						break;
					}
					case '{':
						if (stream.match(tableRegex[isTemplate ? 1 : 0])) {
							chain(state, this.inTableDefinition());
							return makeLocalTagStyle('tableBracket', state);
						}
						break;
					case '-':
						if (stream.match(/^-{3,}/u)) {
							return tokens.hr;
						}
						break;
					default:
						if (/\s/u.test(ch)) {
							// Leading spaces is valid syntax for tables, bug T108454
							const mt = stream.match(spacedTableRegex[isTemplate ? 1 : 0]);
							if (mt) {
								chain(state, this.eatStartTable);
								return makeLocalStyle(mt[1] ? tokens.list : '', state);
							} else if (ch === ' ') {
								/** @todo indent-pre is sometimes suppressed */
								return tokens.skipFormatting;
							}
						}
				}
			} else {
				ch = stream.next()!;
			}

			const {dt} = state;
			switch (ch) {
				case '~':
					if (stream.match(/^~{2,4}/u)) {
						return tokens.signature;
					}
					break;
				case '<': {
					if (stream.match('!--')) { // comment
						chain(state, this.inComment);
						return makeLocalTagStyle('comment', state);
					}
					const isCloseTag = Boolean(stream.eat('/')),
						mt = stream.match(/^([a-z][^\s/>]*)>?/iu, false);
					if (mt) {
						const tagname = mt[1]!.toLowerCase(),
							{data: {tags}, inHtmlTag} = state;
						if (
							mt[0] === 'onlyinclude>' && tags.includes('onlyinclude')
							|| tagname !== 'onlyinclude' && tags.includes(tagname)
						) {
							// Extension tag
							if (isCloseTag) {
								chain(state, this.inStr('>', 'error'));
								return makeLocalTagStyle('error', state);
							}
							chain(state, this.eatTagName(tagname));
							return makeLocalTagStyle('extTagBracket', state);
						} else if (this.permittedHtmlTags.has(tagname)) {
							// Html tag
							if (isCloseTag) {
								if (dt.n && dt.html) {
									dt.html--;
								}
								if (tagname === inHtmlTag[0]) {
									inHtmlTag.shift();
								} else {
									chain(state, this.inStr('>', 'error'));
									const i = inHtmlTag.lastIndexOf(tagname);
									if (i !== -1) {
										inHtmlTag.splice(i, 1);
									}
									return makeLocalTagStyle('error', state);
								}
							}
							chain(state, this.eatTagName(tagname, isCloseTag, true));
							return makeLocalTagStyle('htmlTagBracket', state);
						}
					}
					break;
				}
				case '{': {
					// Can't be a variable when it starts with more than 3 brackets (T108450) or
					// a single { followed by a template. E.g. {{{!}} starts a table (T292967).
					if (stream.match(/^\{\{(?!\{|[^{}]*\}\}(?!\}))\s*/u)) {
						state.nVar++;
						chain(state, this.inVariable());
						return makeLocalTagStyle('templateVariableBracket', state);
					}
					const mt = stream.match(/^\{(?!\{(?!\{))(\s*)/u);
					if (mt) {
						return this.eatTransclusion(stream, state, mt[1]!) ?? makeStyle(style, state);
					}
					break;
				}
				case '_': {
					const {pos} = stream;
					stream.eatWhile('_');
					switch (stream.pos - pos) {
						case 0:
							break;
						case 1:
							return this.eatDoubleUnderscore(style, stream, state);
						default:
							if (!stream.eol()) {
								stream.backUp(2);
							}
							return makeStyle(style, state);
					}
					break;
				}
				case '[':
					// Link Example: [[ Foo | Bar ]]
					if (stream.match(this.linkRegex)) {
						const {redirect} = state;
						if (redirect || /[^[\]|]/u.test(stream.peek() || '')) {
							state.nLink++;
							state.lbrack = undefined;
							chain(
								state,
								this.inLink(!redirect && Boolean(stream.match(this.fileRegex, false))),
							);
							return makeLocalTagStyle('linkBracket', state);
						} else if (stream.match(']]')) {
							return makeStyle(style, state);
						}
					} else {
						const mt = stream.match(this.urlProtocols, false);
						if (mt) {
							state.nExtLink++;
							chain(state, this.eatExternalLinkProtocol(mt[0], false));
							return makeLocalTagStyle('extLinkBracket', state);
						}
					}
					break;
				case "'": {
					const result = this.eatApostrophes(state)(stream, state);
					if (result) {
						return result;
					}
					break;
				}
				case ':':
					if (needColon(state)) {
						dt.n--;
						return makeLocalTagStyle('list', state);
					}
					break;
				case '&':
					return makeStyle(this.eatEntity(stream, style), state);
				case '-':
					if (this.config.variants?.length && stream.match(/^\{(?!\{)\s*/u)) {
						chain(state, this.inConvert(style, true));
						return makeLocalTagStyle('convertBracket', state);
					}
				// no default
			}
			if (state.stack.length === 0) {
				if (/[^\p{L}\d_]/u.test(ch || '')) {
					// highlight free external links, bug T108448
					stream.eatWhile(/[^\p{L}\d_&'{[<~:-]/u);
					const mt = stream.match(this.urlProtocols, false);
					if (mt && !stream.match('//')) {
						chain(state, this.eatExternalLinkProtocol(mt[0]));
						return makeStyle(style, state);
					}
					const mtMagic = stream.match(regex, false);
					if (mtMagic) {
						chain(state, this.inChars(mtMagic[0], 'magicLink'));
						return makeStyle(style, state);
					}
				}
				stream.eatWhile(/[\p{L}\d]/u);
			}
			return makeStyle(style, state);
		};
	}

	@getTokenizer
	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	eatApostrophes(obj: Pick<State, 'bold' | 'italic'>): Tokenizer<string | false> {
		return (stream, state) => {
			// skip the irrelevant apostrophes ( >5 or =4 )
			if (stream.match(/^'*(?='{5})/u) || stream.match(/^'''(?!')/u, false)) {
				return false;
			} else if (stream.match("''''")) { // bold italic
				obj.bold = !obj.bold;
				obj.italic = !obj.italic;
				return makeLocalTagStyle('apostrophes', state);
			} else if (stream.match("''")) { // bold
				if (obj === state && state.data.firstSingleLetterWord === null) {
					prepareItalicForCorrection(stream, state);
				}
				obj.bold = !obj.bold;
				return makeLocalTagStyle('apostrophes', state);
			} else if (stream.eat("'")) { // italic
				obj.italic = !obj.italic;
				return makeLocalTagStyle('apostrophes', state);
			}
			return false;
		};
	}

	@getTokenizer
	eatExternalLinkProtocol({length}: string, free = true): Tokenizer {
		return (stream, state) => {
			stream.pos += length;
			state.tokenize = free ? this.eatFreeExternalLink : this.inExternalLink();
			return makeLocalTagStyle(free ? 'freeExtLinkProtocol' : 'extLinkProtocol', state);
		};
	}

	@getTokenizer
	inExternalLink(text?: boolean): Tokenizer {
		return (stream, state) => {
			const t = state.stack[0]!,
				isArgument = t.name === 'inTemplateArgument' && t.args![0],
				isNested = ['inTemplateArgument', 'inParserFunctionArgument', 'inVariable', 'inTableCell']
					.includes(t.name),
				pipe = (isNested ? '|' : '') + (isArgument ? '=' : ''),
				peek = stream.peek();
			if (
				stream.sol()
				|| stream.match(/^\p{Zs}*\]/u)
				|| isNested && peek === '|'
				|| isArgument && peek === '='
			) {
				pop(state);
				return makeLocalTagStyle('extLinkBracket', state, 'nExtLink');
			} else if (text) {
				return stream.match(getExtLinkTextRegex(pipe))
					? makeTagStyle('extLinkText', state)
					: this.eatWikiText('extLinkText')(stream, state);
			} else if (stream.match(getExtLinkRegex(pipe))) {
				return makeLocalTagStyle('extLink', state);
			}
			state.tokenize = this.inExternalLink(true);
			return '';
		};
	}

	@getTokenizer
	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	get eatFreeExternalLink(): Tokenizer {
		return (stream, state) => {
			const mt = stream.match(freeRegex[0])!;
			if (!stream.eol() && mt[0].includes('(') && getPunctuations().includes(stream.peek()!)) {
				stream.match(freeRegex[1]);
			}
			pop(state);
			return makeTagStyle('freeExtLink', state);
		};
	}

	@getTokenizer
	inLink(file: boolean, section?: boolean): Tokenizer {
		const style = section ? tokens[file ? 'error' : 'linkToSection'] : `${tokens.linkPageName} ${tokens.pageName}`,
			re = section
				? /^(?:[^|<[\]{}]|<(?!!--|\/?[a-z]))+/iu
				: /^(?:&#(?:\d+|x[a-f\d]+);|[^#|<>[\]{}%]|%(?!3[ce]|[57][bd]))+/iu;
		let lt: number | undefined;
		return (stream, state) => {
			if (stream.sol() || lt && stream.pos > lt || stream.match(/^\s*\]\]/u)) {
				state.redirect = false;
				state.lbrack = false;
				pop(state);
				return makeLocalTagStyle('linkBracket', state, 'nLink');
			}
			lt = undefined;
			const space = stream.eatSpace(),
				{redirect} = state;
			if (!section && stream.match(/^#\s*/u)) {
				state.tokenize = this.inLink(file, true);
				return makeTagStyle(file ? 'error' : 'linkToSection', state);
			} else if (stream.match(/^\|\s*/u)) {
				state.tokenize = this.inLinkText(file);
				if (file) {
					this.toEatImageParameter(stream, state);
				}
				return makeLocalTagStyle(redirect ? 'error' : 'linkDelimiter', state);
			}
			let regex;
			if (redirect) {
				regex = /^(?:[<>[{}]|\](?!\])|%(?:3[ce]|[57][bd]))+/iu;
			} else if (section) {
				regex = /^(?:[[}]|\](?!\])|\{(?!\{))+/u;
			} else {
				regex = /^(?:[>[}]|\](?!\])|\{(?!\{)|<(?!!--|\/?[a-z])|%(?:3[ce]|[57][bd]))+/iu;
			}
			if (stream.match(regex)) {
				return makeTagStyle('error', state);
			} else if (redirect) {
				stream.match(/^(?:[^|<>[\]{}%]|%(?!3[ce]|[57][bd]))+/iu);
				return makeStyle(style, state);
			} else if (stream.match(re) || space) {
				return makeStyle(style, state);
			} else if (stream.match(/^<[/a-z]/iu, false)) {
				lt = stream.pos + 1;
			}
			return this.eatWikiText(section ? style : 'error')(stream, state);
		};
	}

	@getTokenizer
	inLinkText(file: boolean, gallery?: boolean): Tokenizer {
		const linkState = {bold: false, italic: false},
			regex = linkTextRegex[file ? 1 : 0];
		return (stream, state) => {
			const tmpstyle = `${tokens[file ? 'fileText' : 'linkText']} ${linkState.bold ? tokens.strong : ''} ${
					linkState.italic ? tokens.em : ''
				} ${file && state.imgLink ? tokens.pageName : ''}`,
				{redirect, lbrack} = state,
				closing = stream.match(']]');
			if (closing || !file && stream.match('[[', false)) {
				if (gallery) {
					return makeStyle(tmpstyle, state);
				} else if (closing && !redirect && lbrack && stream.peek() === ']') {
					stream.backUp(1);
					state.lbrack = false;
					return makeStyle(tmpstyle, state);
				}
				state.redirect = false;
				state.lbrack = false;
				pop(state);
				return makeLocalTagStyle('linkBracket', state, 'nLink');
			} else if (redirect) {
				if (!stream.skipTo(']]')) {
					stream.skipToEnd();
				}
				return makeLocalTagStyle('error', state);
			} else if (file && stream.match(/^\|\s*/u)) {
				this.toEatImageParameter(stream, state);
				return makeLocalTagStyle('linkDelimiter', state);
			} else if (stream.match(/^'(?=')/u)) {
				return this.eatApostrophes(linkState)(stream, state) || makeStyle(tmpstyle, state);
			} else if (
				file && isSolSyntax(stream, true, true)
				|| stream.sol() && stream.match('{|', false)
			) {
				return this.eatWikiText(tmpstyle)(stream, state);
			}
			const mt = stream.match(regex);
			if (lbrack === undefined && mt?.[0].includes('[')) {
				state.lbrack = true;
			}
			return mt ? makeStyle(tmpstyle, state) : this.eatWikiText(tmpstyle)(stream, state);
		};
	}

	toEatImageParameter(stream: StringStream, state: State): void {
		state.imgLink = false;
		const mt = stream.match(this.imgRegex, false);
		if (mt) {
			if (this.config.img?.[`${mt[0]}$1`] === 'img_link') {
				state.imgLink = true;
			}
			chain(state, this.inChars(mt[0], 'imageParameter'));
		}
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	eatList(stream: StringStream, state: State): string {
		const mt = stream.match(/^[*#;:]*/u)!,
			{dt} = state;
		if (mt[0].includes(';')) {
			dt.n = mt[0].split(';').length - 1;
			copyNesting(dt, state);
		}
		return makeLocalTagStyle('list', state);
	}

	eatDoubleUnderscore(style: string, stream: StringStream, state: State): Style {
		const {config: {doubleUnderscore}} = this,
			name = stream.match(/^[\p{L}\d_]+?__/u);
		if (name) {
			if (
				Object.prototype.hasOwnProperty.call(doubleUnderscore[0], `__${name[0].toLowerCase()}`)
				|| Object.prototype.hasOwnProperty.call(doubleUnderscore[1], `__${name[0]}`)
			) {
				return tokens.doubleUnderscore;
			} else if (!stream.eol()) {
				// Two underscore symbols at the end can be the beginning of another double underscored Magic Word
				stream.backUp(2);
			}
		}
		return makeStyle(style, state);
	}

	@getTokenizer
	get eatStartTable(): Tokenizer {
		return (stream, state) => {
			stream.match(/^(?:\{\||\{\{(?:\{\s*|\s*\()!\s*\}\})\s*/u);
			state.tokenize = this.inTableDefinition();
			return makeLocalTagStyle('tableBracket', state);
		};
	}

	@getTokenizer
	inTableDefinition(tr?: boolean, quote?: string): Tokenizer {
		const style = `${tokens.tableDefinition} mw-html-${tr ? 'tr' : 'table'}`;
		return (stream, state) => {
			if (stream.sol()) {
				state.tokenize = this.inTable;
				return '';
			}
			const t = state.stack[0]!,
				equal = t.name === 'inTemplateArgument' && t.args![0] ? '=' : '';
			if (equal && stream.peek() === '=') {
				pop(state);
				return '';
			} else if (stream.match(/^(?:&|\{\{|<(?:!--|\/?[a-z]))/iu, false)) {
				return this.eatWikiText(style)(stream, state);
			} else if (quote) { // 有引号的属性值
				if (stream.eat(quote[0]!)) {
					state.tokenize = this.inTableDefinition(tr, quote[1]);
				} else {
					stream.match(getTableDefinitionRegex(equal + quote[0]));
				}
				return makeLocalTagStyle('tableDefinitionValue', state);
			} else if (quote === '') { // 无引号的属性值
				if (/\s/u.test(stream.peek() ?? '')) {
					state.tokenize = this.inTableDefinition(tr);
					return '';
				}
				stream.match(tableDefinitionValueRegex[equal ? 1 : 0]);
				return makeLocalTagStyle('tableDefinitionValue', state);
			} else if (stream.match(/^=\s*/u)) {
				const next = stream.peek();
				state.tokenize = this.inTableDefinition(tr, /['"]/u.test(next ?? '') ? next!.repeat(2) : '');
				return makeLocalStyle(style, state);
			}
			stream.match(tableDefinitionRegex);
			return makeLocalStyle(style, state);
		};
	}

	@getTokenizer
	get inTable(): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				stream.eatSpace();
				const mt = stream.match(/^(?:\||\{\{\s*!([!)+-])?\s*\}\})/u);
				if (mt) {
					if (mt[1] === '-' || !mt[1] && stream.eat('-')) {
						stream.match(/^-*\s*/u);
						state.tokenize = this.inTableDefinition(true);
						return makeLocalTagStyle('tableDelimiter', state);
					} else if (mt[1] === '+' || !mt[1] && stream.match(/^\+\s*/u)) {
						state.tokenize = this.inTableCell(tokens.tableCaption);
						return makeLocalTagStyle('tableDelimiter', state);
					} else if (mt[1] === ')' || !mt[1] && stream.eat('}')) {
						pop(state);
						return makeLocalTagStyle('tableBracket', state);
					}
					stream.eatSpace();
					state.tokenize = this.inTableCell(tokens.tableTd, mt[1] !== '!');
					return makeLocalTagStyle('tableDelimiter', state);
				} else if (stream.match(/^!\s*/u)) {
					state.tokenize = this.inTableCell(tokens.tableTh);
					return makeLocalTagStyle('tableDelimiter', state);
				} else if (isSolSyntax(stream, true)) {
					return this.eatWikiText('error')(stream, state);
				}
			}
			return stream.match(wikiRegex)
				? makeTagStyle('error', state)
				: this.eatWikiText('error')(stream, state);
		};
	}

	@getTokenizer
	inTableCell(style: string, needAttr = true, firstLine = true): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				if (stream.match(/^\s*(?:[|!]|\{\{\s*![!)+-]?\s*\}\})/u, false)) {
					state.tokenize = this.inTable;
					return '';
				} else if (firstLine) {
					state.tokenize = this.inTableCell(style, false, false);
					return '';
				} else if (isSolSyntax(stream, true)) {
					return this.eatWikiText(style)(stream, state);
				}
			}
			if (firstLine) {
				if (
					stream.match(/^(?:(?:\||\{\{\s*!\s*\}\}){2}|\{\{\s*!!\s*\}\})\s*/u)
					|| style === tokens.tableTh && stream.match(/^!!\s*/u)
				) {
					state.bold = false;
					state.italic = false;
					if (!needAttr) {
						state.tokenize = this.inTableCell(style);
					}
					return makeLocalTagStyle('tableDelimiter', state);
				} else if (needAttr && stream.match(/^(?:\||\{\{\s*!\s*\}\})\s*/u)) {
					state.bold = false;
					state.italic = false;
					state.tokenize = this.inTableCell(style, false);
					return makeLocalTagStyle('tableDelimiter2', state);
				} else if (needAttr && stream.match('[[', false)) {
					state.tokenize = this.inTableCell(style, false);
				}
			}
			const t = state.stack[0]!,
				equal = t.name === 'inTemplateArgument' && t.args![0] ? '=' : '';
			if (equal && stream.peek() === '=') {
				pop(state);
				return '';
			}
			return stream.match(getTableCellRegex((firstLine ? '|!' : ':') + equal))
				? makeStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	@getTokenizer
	inSectionHeader(str: string): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				pop(state);
				return '';
			} else if (stream.match(headerRegex)) {
				if (stream.eol()) {
					stream.backUp(str.length);
					state.tokenize = this.inStr(str, 'sectionHeader');
				} else if (stream.match(/^<!--(?!.*?-->.*?=)/u, false)) {
					// T171074: handle trailing comments
					stream.backUp(str.length);
					state.tokenize = this.inStr('<!--', false, 'sectionHeader');
				}
				return makeLocalTagStyle('section', state);
			}
			return this.eatWikiText('section')(stream, state);
		};
	}

	@getTokenizer
	get inComment(): Tokenizer {
		return this.inStr('-->', 'comment', 'comment');
	}

	@getTokenizer
	eatTagName(name: string, isCloseTag?: boolean, isHtmlTag?: boolean): Tokenizer {
		return (stream, state) => {
			stream.match(name, true, true);
			stream.eatSpace();
			if (isHtmlTag) {
				state.tokenize = isCloseTag
					? this.inStr('>', 'htmlTagBracket')
					: this.inHtmlTagAttribute(name);
				return makeLocalTagStyle('htmlTagName', state);
			}
			// it is the extension tag
			state.tokenize = isCloseTag ? this.inStr('>', 'extTagBracket') : this.inExtTagAttribute(name);
			return makeLocalTagStyle('extTagName', state);
		};
	}

	@getTokenizer
	inHtmlTagAttribute(name: string, quote?: string): Tokenizer {
		const style = quote === undefined
			? `${tokens.htmlTagAttribute} mw-html-${name}`
			: tokens.htmlTagAttributeValue;
		return (stream, state) => {
			if (stream.match(new RegExp(`^${lookahead('<', state)}`, 'iu'), false)) {
				pop(state);
				return '';
			}
			const mt = stream.match(/^\/?>/u);
			if (mt) {
				if (!this.implicitlyClosedHtmlTags.has(name) && (mt[0] === '>' || !selfClosingTags.includes(name))) {
					state.inHtmlTag.unshift(name);
					state.dt.html++;
				}
				pop(state);
				return makeLocalTagStyle('htmlTagBracket', state);
			}
			const t = state.stack[0]!,
				pipe = (['inTemplateArgument', 'inParserFunctionArgument', 'inVariable'].includes(t.name) ? '|' : '')
					+ (t.name === 'inTemplateArgument' && t.args![0] ? '=' : '');
			if (pipe.includes(stream.peek() ?? '')) {
				pop(state);
				return makeLocalTagStyle('htmlTagBracket', state);
			} else if (stream.match(/^(?:[&<]|\{\{)/u, false)) {
				return this.eatWikiText(style)(stream, state);
			} else if (quote) { // 有引号的属性值
				if (stream.eat(quote[0]!)) {
					state.tokenize = this.inHtmlTagAttribute(name, quote[1]);
				} else {
					stream.match(getHtmlAttrRegex(pipe + quote[0]));
				}
				return makeLocalStyle(style, state);
			} else if (quote === '') { // 无引号的属性值
				if (stream.sol() || /\s/u.test(stream.peek() ?? '')) {
					state.tokenize = this.inHtmlTagAttribute(name);
					return '';
				}
				stream.match(getHtmlAttrRegex(String.raw`\s${pipe}`));
				return makeLocalStyle(style, state);
			} else if (stream.match(/^=\s*/u)) {
				const next = stream.peek();
				state.tokenize = this.inHtmlTagAttribute(name, /['"]/u.test(next ?? '') ? next!.repeat(2) : '');
				return makeLocalStyle(style, state);
			}
			stream.match(getHtmlAttrKeyRegex(pipe));
			return makeLocalStyle(style, state);
		};
	}

	@getTokenizer
	inExtTagAttribute(name: string, quote?: string, isLang?: boolean, isPage?: boolean): Tokenizer {
		const style = `${tokens.extTagAttribute} mw-ext-${name}`;
		const advance = (stream: StringStream, state: State, re: RegExp): string => {
			const mt = stream.match(re)!;
			if (isLang) {
				let lang = mt[0].trim().toLowerCase();
				if (lang === 'js') {
					lang = 'javascript';
				}
				state.extMode = (lang === 'css' || lang === 'javascript' || lang === 'lua' || lang === 'json')
					&& plugins[lang] as StreamParser<object>;
			}
			return makeLocalStyle(tokens.extTagAttributeValue + (isPage ? ` ${tokens.pageName}` : ''), state);
		};
		return (stream, state) => {
			if (stream.eat('>')) {
				const {config: {tagModes}} = this;
				state.extName = name;
				state.extMode ||= name in tagModes
					&& this[tagModes[name] as MimeTypes](state.data.tags.filter(tag => tag !== name));
				if (state.extMode) {
					state.extState = state.extMode.startState!(0);
				}
				state.tokenize = this.eatExtTagArea(name);
				return makeLocalTagStyle('extTagBracket', state);
			} else if (stream.match('/>')) {
				state.extMode = false;
				pop(state);
				return makeLocalTagStyle('extTagBracket', state);
			} else if (quote) { // 有引号的属性值
				if (stream.eat(quote[0]!)) {
					const [, remains] = quote;
					state.tokenize = this.inExtTagAttribute(
						name,
						remains,
						isLang && Boolean(remains),
						isPage && Boolean(remains),
					);
					return makeLocalTagStyle('extTagAttributeValue', state);
				}
				return advance(stream, state, getExtAttrRegex(quote[0]!));
			} else if (quote === '') { // 无引号的属性值
				if (stream.sol() || /\s/u.test(stream.peek() ?? '')) {
					state.tokenize = this.inExtTagAttribute(name);
					return '';
				}
				return advance(stream, state, /^(?:[^>/\s]|\/(?!>))+/u);
			} else if (stream.match(/^=\s*/u)) {
				const next = stream.peek();
				state.tokenize = this.inExtTagAttribute(
					name,
					/['"]/u.test(next ?? '') ? next!.repeat(2) : '',
					isLang,
					isPage,
				);
				return makeLocalStyle(style, state);
			}
			const mt = stream.match(/^(?:[^>/=]|\/(?!>))+/u)!;
			if (stream.peek() === '=') {
				state.tokenize = this.inExtTagAttribute(
					name,
					undefined,
					syntaxHighlight.has(name) && /(?:^|\s)lang\s*$/iu.test(mt[0]),
					name === 'templatestyles' && /(?:^|\s)src\s*$/iu.test(mt[0]),
				);
			}
			return makeLocalStyle(style, state);
		};
	}

	@getTokenizer
	eatExtTagArea(name: string): Tokenizer {
		return (stream, state) => {
			const {pos} = stream,
				i = stream.string.slice(pos).search(getExtTagCloseRegex(name));
			if (i === 0) {
				stream.match('</');
				state.tokenize = this.eatTagName(name, true);
				state.extName = false;
				state.extMode = false;
				state.extState = false;
				return makeLocalTagStyle('extTagBracket', state);
			}
			let origString = '';
			if (i !== -1) {
				origString = stream.string;
				stream.string = origString.slice(0, pos + i);
			}
			chain(state, this.inExtTokens(origString));
			return '';
		};
	}

	@getTokenizer
	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	inExtTokens(origString: string): Tokenizer {
		return (stream, state) => {
			let ret: string;
			if (state.extMode === false) {
				ret = `mw-tag-${state.extName} ${tokens.extTag}`;
				stream.skipToEnd();
			} else {
				ret = `mw-tag-${state.extName} ${state.extMode.token(stream, state.extState as object) ?? ''}`;
			}
			if (stream.eol()) {
				if (origString) {
					stream.string = origString;
				}
				pop(state);
			}
			return ret;
		};
	}

	@getTokenizer
	inVariable(pos = 0): Tokenizer {
		let tag: TagName = 'comment';
		if (pos === 0) {
			tag = 'templateVariableName';
		} else if (pos === 1) {
			tag = 'templateVariable';
		}
		const re = variableRegex[pos === 1 ? 1 : 0];
		return (stream, state) => {
			const sol = stream.sol();
			stream.eatSpace();
			if (stream.eol()) {
				return makeLocalStyle('', state);
			} else if (stream.eat('|')) {
				if (pos < 2) {
					state.tokenize = this.inVariable(pos + 1);
				}
				return makeLocalTagStyle('templateVariableDelimiter', state);
			} else if (stream.match(/^\}{2,3}/u)) {
				pop(state);
				return makeLocalTagStyle('templateVariableBracket', state, 'nVar');
			} else if (stream.match('<!--')) {
				chain(state, this.inComment);
				return makeLocalTagStyle('comment', state);
			} else if (pos === 0 && sol) {
				state.nVar--;
				pop(state);
				stream.pos = 0;
				return '';
			}
			return pos === 1 && isSolSyntax(stream) || !stream.match(re)
				? this.eatWikiText(tag)(stream, state)
				: (pos === 1 ? makeTagStyle : makeLocalTagStyle)(tag, state);
		};
	}

	eatTransclusion(stream: StringStream, state: State, {length}: string): string | undefined {
		// Parser function
		if (stream.peek() === '#') {
			stream.backUp(length);
			state.nExt++;
			chain(state, this.inParserFunctionName());
			return makeLocalTagStyle('parserFunctionBracket', state);
		}
		// Check for parser function without '#'
		const name = stream.match(/^([^}<{|:：]+)(.?)/u, false);
		if (name) {
			const [, f, delimiter] = name as [string, string, string],
				fullWidth = delimiter === '：';
			let ff = f;
			if (fullWidth) {
				ff += '：';
			} else if (delimiter !== ':') {
				ff = f.trim();
			}
			const ffLower = ff.toLowerCase(),
				{config: {functionSynonyms, variableIDs, functionHooks}} = this,
				canonicalName = Object.prototype.hasOwnProperty.call(functionSynonyms[1], ff)
					&& functionSynonyms[1][ff]
					|| Object.prototype.hasOwnProperty.call(functionSynonyms[0], ffLower)
					&& functionSynonyms[0][ffLower];
			if (
				(!delimiter || fullWidth || delimiter === ':' || delimiter === '}')
				&& canonicalName
				&& (fullWidth || delimiter === ':' || !variableIDs || variableIDs.includes(canonicalName))
				&& (
					!fullWidth && delimiter !== ':'
					|| !functionHooks
					|| functionHooks.includes(canonicalName) || otherParserFunctions.has(canonicalName)
				)
			) {
				stream.backUp(length);
				state.nExt++;
				chain(state, this.inParserFunctionName());
				return makeLocalTagStyle('parserFunctionBracket', state);
			}
		}
		if (stream.match('}}')) {
			return undefined;
		}
		// Template
		stream.backUp(length);
		state.nTemplate++;
		chain(state, this.inTemplatePageName());
		return makeLocalTagStyle('templateBracket', state);
	}

	@getTokenizer
	inParserFunctionName(invoke?: number, n?: number, ns?: number): Tokenizer {
		return (stream, state) => {
			const sol = stream.sol(),
				space = stream.eatSpace();
			if (stream.eol()) {
				return makeLocalStyle('', state);
			} else if (stream.eat('}')) {
				pop(state);
				return makeLocalTagStyle(
					stream.eat('}') ? 'parserFunctionBracket' : 'error',
					state,
					'nExt',
				);
			} else if (stream.match('<!--')) {
				chain(state, this.inComment);
				return makeLocalTagStyle('comment', state);
			} else if (sol) {
				state.nExt--;
				pop(state);
				stream.pos = 0;
				return '';
			}
			const ch = stream.eat(/[:：|]/u);
			if (ch) {
				state.tokenize = this.inParserFunctionArgument(invoke, n, ns);
				return makeLocalTagStyle(space || ch === '|' ? 'error' : 'parserFunctionDelimiter', state);
			}
			const mt = stream.match(/^(?:[^:：}{|<>[\]\s]|\s(?![:：]))+/u);
			if (mt) {
				const name = mt[0].trim().toLowerCase() + (stream.peek() === '：' ? '：' : ''),
					{config: {functionSynonyms: [insensitive]}} = this;
				if (name.startsWith('#')) {
					switch (insensitive[name] ?? insensitive[name.slice(1)]!) {
						case 'invoke':
							state.tokenize = this.inParserFunctionName(2);
							break;
						case 'widget':
							state.tokenize = this.inParserFunctionName(1);
							break;
						case 'switch':
							state.tokenize = this.inParserFunctionName(undefined, 1);
							break;
						case 'tag':
							state.tokenize = this.inParserFunctionName(undefined, 2);
							break;
						case 'ifexist':
						case 'lst':
						case 'lstx':
						case 'lsth':
							state.tokenize = this.inParserFunctionName(Infinity);
						// no default
					}
				} else {
					const canonicalName = insensitive[name];
					if (pageFunctions.has(canonicalName)) {
						let namespace = 0;
						switch (canonicalName) {
							case 'filepath':
								namespace = 6;
								break;
							case 'int':
								namespace = 8;
								break;
							case 'msgnw':
								namespace = 10;
							// no default
						}
						state.tokenize = this.inParserFunctionName(Infinity, Infinity, namespace);
					}
				}
				return makeLocalTagStyle('parserFunctionName', state);
			}
			pop(state);
			return makeLocalStyle('', state, 'nExt');
		};
	}

	@getTokenizer
	inTemplatePageName(haveEaten?: boolean, anchor?: boolean): Tokenizer {
		const style = anchor ? tokens.error : `${tokens.templateName} ${tokens.pageName}`,
			chars = '{}<',
			re = anchor ? templateRegex : /^(?:&#(?:\d+|x[a-f\d]+);|[^|{}<>[\]#%]|%(?![\da-f]{2}))+/iu;
		return (stream, state) => {
			const sol = stream.sol(),
				space = stream.eatSpace();
			if (stream.eol()) {
				return makeLocalStyle('', state);
			} else if (stream.match('}}')) {
				pop(state);
				return makeLocalTagStyle('templateBracket', state, 'nTemplate');
			} else if (stream.match('<!--')) {
				chain(state, this.inComment);
				return makeLocalTagStyle('comment', state);
			} else if (stream.eat('|')) {
				state.tokenize = this.inTemplateArgument(true);
				return makeLocalTagStyle('templateDelimiter', state);
			} else if (haveEaten && sol) {
				state.nTemplate--;
				pop(state);
				stream.pos = 0;
				return '';
			} else if (!anchor && stream.eat('#')) {
				state.tokenize = this.inTemplatePageName(true, true);
				return makeLocalTagStyle('error', state);
			} else if (
				!anchor
				&& stream.match(
					new RegExp(String.raw`^(?:[>[\]]|%[\da-f]{2}|${lookahead(chars, state)})+`, 'iu'),
				)
			) {
				return makeLocalTagStyle('error', state);
			} else if (!anchor && stream.peek() === '<') {
				pop(state);
				return makeLocalStyle('', state, 'nTemplate');
			} else if (space && !haveEaten) {
				return makeLocalStyle('', state);
			} else if (stream.match(re)) {
				if (!haveEaten) {
					state.tokenize = this.inTemplatePageName(true, anchor);
				}
				return makeLocalStyle(style, state);
			}
			return space
				? makeLocalStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	@getTokenizer
	inParserFunctionArgument(module?: number, n = module ?? Infinity, ns = 0): Tokenizer {
		if (n === 0) {
			return this.inTemplateArgument(true, true);
		}
		const chars = n === 2 ? '}{<' : "}{<~'_-"; // `#invoke`/`#tag`
		let style = `${tokens.parserFunction} ${module ? tokens.pageName : ''}`;
		switch (module) {
			case 1:
				style += ' mw-function-274';
				break;
			case 2:
				style += ' mw-function-828';
				break;
			case Infinity:
				style += ` mw-function-${ns}`;
			// no default
		}
		return (stream, state) => {
			if (stream.eat('|')) {
				if (module) {
					state.tokenize = this.inParserFunctionArgument(undefined, module - 1);
				} else if (n !== Infinity) {
					state.tokenize = this.inParserFunctionArgument(undefined, n - 1);
				}
				return makeLocalTagStyle('parserFunctionDelimiter', state);
			} else if (stream.match('}}')) {
				pop(state);
				return makeLocalTagStyle('parserFunctionBracket', state, 'nExt');
			}
			return !isSolSyntax(stream)
				&& stream.match(parserFunctionRegex[module ? 0 : Number(needColon(state)) + 1]!(chars))
				? makeLocalStyle(style, state)
				: this.eatWikiText('parserFunction')(stream, state);
		};
	}

	@getTokenizer
	inTemplateArgument(expectName?: boolean, parserFunction?: boolean): Tokenizer {
		const tag = parserFunction ? 'parserFunction' : 'template';
		return (stream, state) => {
			const space = stream.eatSpace();
			if (stream.eol()) {
				return makeLocalTagStyle(tag, state);
			} else if (stream.eat('|')) {
				if (!expectName) {
					state.tokenize = this.inTemplateArgument(true, parserFunction);
				}
				return makeLocalTagStyle(parserFunction ? 'parserFunctionDelimiter' : 'templateDelimiter', state);
			} else if (stream.match('}}', false)) {
				if (space) {
					return makeLocalTagStyle(tag, state);
				}
				stream.pos += 2;
				pop(state);
				return makeLocalTagStyle(
					parserFunction ? 'parserFunctionBracket' : 'templateBracket',
					state,
					parserFunction ? 'nExt' : 'nTemplate',
				);
			} else if (stream.sol() && stream.peek() === '=') {
				const style = this.eatWikiText(tag)(stream, state);
				if (style.includes(tokens.sectionHeader)) {
					return style;
				}
				stream.pos = 0;
			}
			if (
				expectName
				&& stream.match(new RegExp(`^(?:[^=|}{[<]|${lookahead('}{[<', state)})*=`, 'iu'))
			) {
				state.tokenize = this.inTemplateArgument(false, parserFunction);
				return makeLocalTagStyle('templateArgumentName', state);
			} else if (isSolSyntax(stream) && stream.peek() !== '=') {
				return this.eatWikiText(tag)(stream, state);
			}
			return stream.match(needColon(state) ? argumentRegex : styleRegex) || space
				? makeLocalTagStyle(tag, state)
				: this.eatWikiText(tag)(stream, state);
		};
	}

	@getTokenizer
	inConvert(style: string, needFlag?: boolean, needLang = true, plain?: boolean): Tokenizer {
		return (stream, state) => {
			const space = stream.eatSpace();
			if (stream.match('}-')) {
				pop(state);
				return makeLocalTagStyle('convertBracket', state);
			} else if (needFlag && stream.match(/^[;\sa-z-]*(?=\|)/iu)) {
				chain(state, this.inConvert(style, false, true, plain));
				state.tokenize = this.inStr('|', 'convertDelimiter');
				return makeLocalTagStyle('convertFlag', state);
			} else if (stream.match(this.convertSemicolon!)) {
				if (needFlag || !needLang) {
					state.tokenize = this.inConvert(style, false, true, plain);
				}
				return makeLocalTagStyle('convertDelimiter', state);
			} else if (needLang && stream.match(this.convertLang!)) {
				state.tokenize = this.inConvert(style, false, false, plain);
				return makeLocalTagStyle('convertLang', state);
			} else if (plain) {
				if (stream.match('-{', false)) {
					return this.eatWikiText(style)(stream, state);
				}
				stream.match(/^(?:(?:[^};=-]|\}(?!-)|=(?!>)|-(?!\{))+|;|=>)/u);
				return makeStyle(style, state);
			}
			return !isSolSyntax(stream, true) && stream.match(convertRegex) || space
				? makeStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	eatEntity(stream: StringStream, style: string): string {
		const entity = stream.match(/^(?:#x[a-f\d]+|#\d+|[a-z\d]+);/iu);
		return entity && isHtmlEntity(entity[0]) ? tokens.htmlEntity : style;
	}

	/**
	 * main entry
	 *
	 * @see https://codemirror.net/docs/ref/#language.StreamParser
	 *
	 * @param tags
	 */
	mediawiki(tags?: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.eatWikiText(''), tags ?? this.tags, tags === undefined),

			copyState,

			token(stream: StringStream, state): string {
				const {data} = state,
					{readyTokens} = data;
				let {oldToken} = data;
				while (
					oldToken
					&& (
						// 如果 PartialParse 的起点位于当前位置之后
						stream.pos > oldToken.pos
						|| stream.pos === oldToken.pos && state.tokenize !== oldToken.state.tokenize
					)
				) {
					oldToken = readyTokens.shift()!;
				}
				if (
					// 检查起点
					stream.pos === oldToken?.pos
					&& stream.string === oldToken.string
					&& cmpNesting(state, oldToken.state)
				) {
					const {pos, string, state: {bold, italic, ...other}, style} = readyTokens[0]!;
					Object.assign(state, other);
					if (
						!(state.extName && state.extMode)
						&& state.nLink === 0
						&& typeof style === 'string'
						&& style.includes(tokens.apostrophes)
					) {
						if (data.mark === pos) {
							// rollback
							data.mark = null;
							// add one apostrophe, next token will be italic (two apostrophes)
							stream.string = string.slice(0, pos - 2);
							const s = state.tokenize(stream, state);
							stream.string = string;
							oldToken.pos++;
							data.oldToken = oldToken;
							return makeFullStyle(s, state);
						}
						const length = pos - stream.pos;
						if (length !== 3) {
							state.italic = !state.italic;
						}
						if (length !== 2) {
							state.bold = !state.bold;
						}
					} else if (typeof style === 'string' && style.includes(tokens.tableDelimiter)) {
						state.bold = false;
						state.italic = false;
					}
					// return first saved token
					data.oldToken = readyTokens.shift()!;
					stream.pos = pos;
					stream.string = string;
					return makeFullStyle(style, state);
				} else if (stream.sol()) {
					// reset bold and italic status in every new line
					state.bold = false;
					state.italic = false;
					state.dt.n = 0;
					state.dt.html = 0;
					data.firstSingleLetterWord = null;
					data.firstMultiLetterWord = null;
					data.firstSpace = null;
					if (state.tokenize.name === 'inExtTokens') {
						pop(state); // dispose inExtTokens
						pop(state); // dispose eatExtTagArea
						state.extName = false;
						state.extMode = false;
						state.extState = false;
					}
				}
				readyTokens.length = 0;
				data.mark = null;
				data.oldToken = {pos: stream.pos, string: stream.string, state: copyState(state), style: ''};
				const {start} = stream;
				do {
					// get token style
					stream.start = stream.pos;
					const style = state.tokenize(stream, state);
					if (typeof style === 'string' && style.includes(tokens.templateArgumentName)) {
						for (let i = readyTokens.length - 1; i >= 0; i--) {
							const token = readyTokens[i]!;
							if (cmpNesting(state, token.state, true)) {
								const types = typeof token.style === 'string' && token.style.split(' '),
									j = types && types.indexOf(tokens.template);
								if (j !== false && j !== -1) {
									types[j] = tokens.templateArgumentName;
									token.style = types.join(' ');
								} else if (types && types.includes(tokens.templateDelimiter)) {
									break;
								}
							}
						}
					} else if (typeof style === 'string' && style.includes(tokens.tableDelimiter2)) {
						for (let i = readyTokens.length - 1; i >= 0; i--) {
							const token = readyTokens[i]!;
							if (cmpNesting(state, token.state, true)) {
								const {style: s} = token,
									local = typeof s === 'string',
									type = !local
										&& s[0].split(' ')
											.find(t => t && !t.endsWith('-ground'));
								if (type && type.startsWith('mw-table-')) {
									token.style = `${
										s[0].replace('mw-table-', 'mw-html-')
									} ${tokens.tableDefinition}`;
								} else if (local && s.includes(tokens.tableDelimiter)) {
									break;
								}
							}
						}
					}
					// save token
					readyTokens.push({pos: stream.pos, string: stream.string, state: copyState(state), style});
				} while (/** @todo should end at table delimiter as well */ !stream.eol());
				if (!state.bold || !state.italic) {
					// no need to rollback
					data.mark = null;
				}
				stream.start = start;
				stream.pos = data.oldToken.pos;
				stream.string = data.oldToken.string;
				Object.assign(state, data.oldToken.state);
				return '';
			},

			blankLine(state): void {
				if (state.extName && state.extMode && state.extMode.blankLine) {
					state.extMode.blankLine(state.extState as State, 0);
				}
			},

			indent(state, textAfter, context): number | null {
				return state.extName && state.extMode && state.extMode.indent
					? state.extMode.indent(state.extState as object, textAfter, context)
					: null;
			},

			...tags
				? undefined
				: {
					tokenTable: {
						...this.tokenTable,
						...this.hiddenTable,
						'': Tag.define(),
					},
				},
		};
	}

	'text/mediawiki'(tags?: string[]): StreamParser<State> {
		return this.mediawiki(tags);
	}

	'text/nowiki'(): StreamParser<Record<string, never>> {
		return {
			startState(): Record<string, never> {
				return {};
			},

			token: (stream: StringStream): string => {
				if (stream.eatWhile(/[^&]/u)) {
					return '';
				}
				// eat &
				stream.next();
				return this.eatEntity(stream, '');
			},
		};
	}

	@getTokenizer
	inPre(begin?: boolean): Tokenizer<string> {
		return (stream, state) => {
			if (stream.match(begin ? /^<\/nowiki>/iu : /^<nowiki>/iu)) {
				state.tokenize = this.inPre(!begin);
				return tokens.comment;
			} else if (this.hasVariants && stream.match('-{')) {
				chain(state, this.inConvert('', true, true, true));
				return tokens.convertBracket;
			} else if (stream.eat('&')) {
				return this.eatEntity(stream, '');
			}
			stream.match(this.preRegex[begin ? 1 : 0]);
			return '';
		};
	}

	'text/pre'(): StreamParser<State> {
		return {
			startState: () => startState(this.inPre(), []),

			token: simpleToken,
		};
	}

	@getTokenizer
	inNested(tag: string): Tokenizer<string> {
		const re = tag === 'ref' ? /^(?:\{|(?:[^<{]|\{(?!\{)|<(?!!--|ref(?:[\s/>]|$)))+)/iu : getNestedRegex(tag);
		return (stream, state) => {
			if (tag === 'ref') {
				if (stream.match('<!--')) {
					chain(state, this.inComment);
					return makeLocalTagStyle('comment', state);
				} else if (stream.match(/^\{{3}(?!\{|[^{}]*\}\}(?!\}))\s*/u)) {
					chain(state, this.inVariable());
					return tokens.templateVariableBracket;
				}
				const mt = stream.match(/^\{\{(?!\{(?!\{))(\s*)/u);
				if (mt) {
					return this.eatTransclusion(stream, state, mt[1]!) ?? tokens.comment;
				}
			}
			if (stream.match(re)) {
				return tokens.comment;
			}
			stream.eat('<');
			chain(state, this.eatTagName(tag));
			return tokens.extTagBracket;
		};
	}

	'text/references'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inNested('ref'), tags),

			token: simpleToken,
		};
	}

	'text/choose'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inNested('option'), tags),

			token: simpleToken,
		};
	}

	'text/combobox'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inNested('combooption'), tags),

			token: simpleToken,
		};
	}

	@getTokenizer<string>
	get inInputbox(): Tokenizer<string> {
		return (stream, state) => {
			if (stream.match('<!--')) {
				chain(state, this.inComment);
				return tokens.comment;
			}
			/** @todo braces should also be parsed */
			stream.match(/^(?:[^<]|<(?!!--))+/u);
			return '';
		};
	}

	'text/inputbox'(): StreamParser<State> {
		return {
			startState: () => startState(this.inInputbox, []),

			token: simpleToken,
		};
	}

	@getTokenizer
	inGallery(section?: boolean): Tokenizer {
		const style = section ? tokens.error : `${tokens.linkPageName} ${tokens.pageName}`,
			regex = section ? /^(?:[[}\]]|\{(?!\{))+/u : /^(?:[>[}\]]|\{(?!\{)|<(?!!--))+/u,
			re = section ? /^(?:[^|<[\]{}]|<(?!!--))+/u : /^(?:&#(?:\d+|x[a-f\d]+);|[^#|<>[\]{}])+/u;
		return (stream, state) => {
			const space = stream.eatSpace();
			if (!section && stream.match(/^#\s*/u)) {
				state.tokenize = this.inGallery(true);
				return makeTagStyle('error', state);
			} else if (stream.match(/^\|\s*/u)) {
				state.tokenize = this.inLinkText(true, true);
				this.toEatImageParameter(stream, state);
				return makeLocalTagStyle('linkDelimiter', state);
			} else if (stream.match(regex)) {
				return makeTagStyle('error', state);
			}
			return stream.match(re) || space
				? makeStyle(style, state)
				: this.eatWikiText(section ? style : 'error')(stream, state);
		};
	}

	'text/gallery'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inGallery(), tags),

			token: (stream: StringStream, state): string => {
				if (stream.sol()) {
					Object.assign(state, startState(this.inGallery(), state.data.tags));
				}
				return simpleToken(stream, state);
			},
		};
	}
}

for (const [language, parser] of Object.entries(plugins)) {
	if (!language.endsWith('LR')) {
		Object.defineProperty(MediaWiki.prototype, language, {
			value(): StreamParser<object> {
				return parser as StreamParser<object>;
			},
		});
	}
}
