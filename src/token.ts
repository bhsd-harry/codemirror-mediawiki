/**
 * @author pastakhov, MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {Tag} from '@lezer/highlight';
import modeConfig from './config';
import type {StreamParser, StringStream} from '@codemirror/language';

const {htmlTags, voidHtmlTags, selfClosingTags, tokenTable, tokens} = modeConfig;

declare type MimeTypes = 'mediawiki'
| 'text/nowiki'
| 'text/references'
| 'text/choose'
| 'text/combobox'
| 'text/inputbox'
| 'text/gallery';
declare type Style = string | [string];
declare type Tokenizer<T = Style> = ((stream: StringStream, state: State) => T) & {args?: unknown[]};
declare type TagName = keyof typeof tokens;
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
	dt: Partial<Nesting> & {n: number};
	redirect: boolean;
	data: MediaWikiData;
}
declare type ExtState = Omit<State, 'dt'> & Partial<Pick<State, 'dt'>>;
declare interface Token {
	pos: number;
	readonly string: string;
	style: Style;
	readonly state: State;
}

export type ApiSuggestions = [string, string?][];

/**
 * 获取维基链接建议
 * @param search 搜索字符串，开头不包含` `
 * @param namespace 命名空间
 * @param subpage 是否为子页面
 */
export type ApiSuggest = (search: string, namespace?: number, subpage?: boolean) =>
	ApiSuggestions | Promise<ApiSuggestions>;

export interface MwConfig {
	readonly tags: Record<string, true>;
	readonly tagModes: Record<string, string>;
	urlProtocols: string;
	functionSynonyms: [Record<string, string>, Record<string, unknown>];
	doubleUnderscore: [Record<string, unknown>, Record<string, unknown>];
	nsid: Record<string, number>;
	variants?: string[];
	img?: Record<string, string>;
	redirection?: string[];
	permittedHtmlTags?: string[];
	implicitlyClosedHtmlTags?: string[];
	linkSuggest?: ApiSuggest;
	paramSuggest?: ApiSuggest;
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

const startState = (tokenize: Tokenizer, tags: string[]): State => ({
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
	dt: {n: 0},
	redirect: false,
	data: new MediaWikiData(tags),
});

/**
 * 复制 StreamParser 状态
 * @param state
 */
const copyState = (state: State): State => {
	const newState = {} as State;
	for (const [key, val] of Object.entries(state)) {
		if (Array.isArray(val)) {
			Object.assign(newState, {[key]: [...val]});
		} else if (key === 'extState') {
			newState.extState = (state.extMode && state.extMode.copyState || copyState)(val as State);
		} else {
			Object.assign(newState, {[key]: key !== 'data' && typeof val === 'object' ? {...val} : val});
		}
	}
	return newState;
};

const span = typeof document === 'object' && document.createElement('span'); // used for isHtmlEntity()

/**
 * 判断字符串是否为 HTML 实体
 * @param str 字符串
 */
const isHtmlEntity = (str: string): boolean => {
	if (!span || str.startsWith('#')) {
		return true;
	}
	span.innerHTML = `&${str}`;
	return [...span.textContent!].length === 1;
};

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
		table && stream.match('{|', false)
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
		'{': '\\{(?!\\{)',
		'}': '\\}(?!\\})',
		'<': comment ? '<(?!!--)' : '<(?!!--|/?[a-z])',
		'~': '~~?(?!~)',
		_: '_(?!_)',
		'[': '\\[(?!\\[)',
		']': '\\](?!\\])',
		'/': '/(?!>)',
		'-': '-(?!\\{(?!\\{))',
	};
	if (typeof comment === 'object') {
		table['<'] = `<(?!!--|onlyinclude>|(?:${comment.data.tags.slice(0, -1).join('|')})(?:[\\s/>]|$))`;
	}
	return [...chars].map(ch => table[ch as keyof typeof table]).join('|');
};

/**
 * 获取外部链接正则表达式
 * @param punctuations 标点符号
 */
const getUrlRegex = (punctuations = ''): string => {
	const chars = "~{'";
	return `[^&${chars}\\p{Zs}[\\]<>"${punctuations}]|&(?![lg]t;)|${lookahead(chars)}`;
};

/**
 * 获取标点符号
 * @param lpar 是否包含左括号
 */
const getPunctuations = (lpar?: boolean): string => `.,;:!?\\\\${lpar ? '' : ')'}`;

/**
 * 获取自由外链正则表达式
 * @param lpar 是否包含左括号
 */
const getFreeRegex = (lpar?: boolean): RegExp => {
	const punctuations = getPunctuations(lpar),
		source = getUrlRegex(punctuations);
	return new RegExp(`^(?:${source}|[${punctuations}]+(?=${source}))*`, 'u');
};

const getTokenizer = <T = Style>(
	method: (...args: any[]) => Tokenizer<T>,
	context: ClassMethodDecoratorContext | ClassGetterDecoratorContext,
) =>
	function(this: MediaWiki, ...args: any[]): Tokenizer<T> {
		const tokenizer = method.apply(this, args);
		Object.defineProperties(tokenizer, {name: {value: context.name}});
		Object.assign(tokenizer, {args});
		return tokenizer;
	};

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
	declare readonly headerRegex;
	declare readonly templateRegex;
	declare readonly argumentRegex;
	declare readonly convertSemicolon;
	declare readonly convertLang;
	declare readonly convertRegex;
	declare readonly wikiRegex;
	declare readonly tableDefinitionRegex;
	declare readonly tags;

	constructor(config: MwConfig) {
		const {
			urlProtocols,
			permittedHtmlTags,
			implicitlyClosedHtmlTags,
			tags,
			nsid,
			redirection = ['#REDIRECT'],
		} = config;
		this.config = config;
		this.tokenTable = {...tokenTable};
		this.hiddenTable = {};
		this.permittedHtmlTags = new Set([
			...htmlTags,
			...permittedHtmlTags || [],
		]);
		this.implicitlyClosedHtmlTags = new Set([
			...voidHtmlTags,
			...implicitlyClosedHtmlTags || [],
		]);
		this.urlProtocols = new RegExp(`^(?:${urlProtocols})(?=[^\\p{Zs}[\\]<>"])`, 'iu');
		this.linkRegex = new RegExp(`^\\[(?!${config.urlProtocols})\\s*`, 'iu');
		this.fileRegex = new RegExp(
			`^(?:${Object.entries(nsid).filter(([, id]) => id === 6).map(([ns]) => ns).join('|')})\\s*:`,
			'iu',
		);
		this.redirectRegex = new RegExp(
			`^(?:${redirection.map(s => s.slice(1)).join('|')})(?:\\s*:)?\\s*(?=\\[\\[)`,
			'iu',
		);
		this.img = Object.keys(config.img || {}).filter(word => !/\$1./u.test(word));
		this.imgRegex = new RegExp(
			`^(?:${
				this.img.filter(word => word.endsWith('$1')).map(word => word.slice(0, -2)).join('|')
			}|(?:${
				this.img.filter(word => !word.endsWith('$1')).join('|')
			}|(?:\\d+x?|\\d*x\\d+)(?:\\s*px)?px)\\s*(?=\\||\\]\\]|$))`,
			'u',
		);
		this.headerRegex = new RegExp(`^(?:[^&[<{~'-]|${lookahead("<{~'-")})+`, 'iu');
		this.tags = [...Object.keys(tags), 'includeonly', 'noinclude', 'onlyinclude'];
		this.templateRegex = new RegExp(`^(?:[^|{}<]|${lookahead('{}<', true)})+`, 'u');
		this.argumentRegex = new RegExp(`^(?:[^|[&:}{<~'_-]|${lookahead("}{<~'_-")})+`, 'iu');
		this.convertSemicolon = new RegExp(
			`^;\\s*(?=(?:[^;]*?=>\\s*)?(?:${config.variants?.join('|')})\\s*:|(?:$|\\}-))`,
			'u',
		);
		this.convertLang = new RegExp(`^(?:=>\\s*)?(?:${this.config.variants?.join('|')})\\s*:`, 'u');
		this.convertRegex = new RegExp(`^(?:[^};&:='{[<~_-]|\\}(?!-)|=(?!>)|${lookahead("'{[<~_-")})+`, 'u');
		this.wikiRegex = new RegExp(`^(?:[^&'{[<~_:-]|${lookahead("'{[<~_-")})+`, 'u');
		this.tableDefinitionRegex = new RegExp(`^(?:[^&={</]|${lookahead('{</')})+`, 'iu');
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
		this[hidden ? 'hiddenTable' : 'tokenTable'][`mw-${token}`] ||= Tag.define(parent);
	}

	/**
	 * Register the ground tokens. These aren't referenced directly in the StreamParser, nor do
	 * they have a parent Tag, so we don't need them as constants like we do for other tokens.
	 * See this.makeLocalStyle() for how these tokens are used.
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
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	makeFullStyle(style: Style, state: ExtState): string {
		return typeof style === 'string'
			? style
			: `${style[0]} ${state.bold || state.dt?.n ? tokens.strong : ''} ${state.italic ? tokens.em : ''}`;
	}

	makeTagStyle(tag: TagName, state: State, endGround?: NestCount): [string] {
		return this.makeStyle(tokens[tag], state, endGround);
	}

	makeStyle(style: string, state: ExtState, endGround?: NestCount): [string] {
		return [this.makeLocalStyle(style, state, endGround)];
	}

	makeLocalTagStyle(tag: TagName, state: State, endGround?: NestCount): string {
		return this.makeLocalStyle(tokens[tag], state, endGround);
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	makeLocalStyle(style: string, state: ExtState, endGround?: NestCount): string {
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
	}

	@getTokenizer
	inStr(str: string, tag: TagName | false, errorTag: TagName = 'error'): Tokenizer {
		return (stream, state) => {
			if (stream.match(str, Boolean(tag))) {
				pop(state);
				return tag ? this.makeLocalTagStyle(tag, state) : '';
			} else if (!stream.skipTo(str)) {
				stream.skipToEnd();
			}
			return this.makeLocalTagStyle(errorTag, state);
		};
	}

	@getTokenizer
	eatWikiText(style: string): Tokenizer {
		if (style in tokens) {
			style = tokens[style as TagName]; // eslint-disable-line no-param-reassign
		}
		const regex
			= /^(?:(?:RFC|PMID)[\p{Zs}\t]+\d+|ISBN[\p{Zs}\t]+(?:97[89][\p{Zs}\t-]?)?(?:\d[\p{Zs}\t-]?){9}[\dxX])\b/u;
		return (stream, state) => {
			let ch: string;
			if (stream.eol()) {
				return '';
			} else if (stream.sol()) {
				if (stream.match('//')) {
					return this.makeStyle(style, state);
				} else if (stream.match(regex)) {
					return this.makeTagStyle('magicLink', state);
				}
				const mtFree = stream.match(this.urlProtocols, false) as RegExpMatchArray | false;
				if (mtFree) {
					chain(state, this.eatExternalLinkProtocol(mtFree[0]));
					return '';
				}
				ch = stream.next()!;
				const isTemplate = ['inTemplateArgument', 'inParserFunctionArgument', 'inVariable']
						.includes(state.tokenize.name),
					pipe = `${isTemplate ? '' : '\\||'}\\{\\{\\s*!\\s*\\}\\}`;
				switch (ch) {
					case '#':
						if (stream.match(this.redirectRegex)) {
							state.redirect = true;
							return tokens.redirect;
						}
						// fall through
					case ';':
					case '*':
						stream.backUp(1);
						return this.eatList(stream, state);
					case ':':
						// Highlight indented tables :{|, bug T108454
						if (stream.match(new RegExp(`^:*\\s*(?=\\{(?:${pipe}))`, 'u'))) {
							chain(state, this.eatStartTable);
							return this.makeLocalTagStyle('list', state);
						}
						return this.eatList(stream, state);
					case '=': {
						const tmp = stream
							.match(/^(={0,5})(.+?(=\1\s*)(?:<!--(?!.*-->\s*\S).*)?)$/u) as RegExpMatchArray | false;
						// Title
						if (tmp) {
							stream.backUp(tmp[2]!.length);
							chain(state, this.inSectionHeader(tmp[3]!));
							return this.makeLocalStyle(
								`${tokens.sectionHeader} mw-section--${tmp[1]!.length + 1}`,
								state,
							);
						}
						break;
					}
					case '{':
						if (stream.match(new RegExp(`^(?:${pipe})\\s*`, 'u'))) {
							chain(state, this.inTableDefinition());
							return this.makeLocalTagStyle('tableBracket', state);
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
							const re = new RegExp(`^\\s*(:+\\s*)?(?=\\{(?:${pipe}))`, 'u'),
								mt = stream.match(re) as RegExpMatchArray | false;
							if (mt) {
								chain(state, this.eatStartTable);
								return this.makeLocalStyle(mt[1] ? tokens.list : '', state);
							} else if (ch === ' ') {
								/** @todo indent-pre is sometimes suppressed */
								return tokens.skipFormatting;
							}
						}
				}
			} else {
				ch = stream.next()!;
			}

			switch (ch) {
				case '~':
					if (stream.match(/^~{2,4}/u)) {
						return tokens.signature;
					}
					break;
				case '<': {
					if (stream.match('!--')) { // comment
						chain(state, this.inComment);
						return this.makeLocalTagStyle('comment', state);
					}
					const isCloseTag = Boolean(stream.eat('/')),
						mt = stream.match(/^([a-z][^\s/>]*)>?/iu, false) as RegExpMatchArray | false;
					if (mt) {
						const tagname = mt[1]!.toLowerCase();
						if (
							mt[0] === 'onlyinclude>'
							|| tagname !== 'onlyinclude' && state.data.tags.includes(tagname)
						) {
							// Extension tag
							if (isCloseTag) {
								chain(state, this.inStr('>', 'error'));
								return this.makeLocalTagStyle('error', state);
							}
							chain(state, this.eatTagName(tagname));
							return this.makeLocalTagStyle('extTagBracket', state);
						} else if (this.permittedHtmlTags.has(tagname)) {
							// Html tag
							if (isCloseTag) {
								if (tagname === state.inHtmlTag[0]) {
									state.inHtmlTag.shift();
								} else {
									chain(state, this.inStr('>', 'error'));
									return this.makeLocalTagStyle('error', state);
								}
							}
							chain(state, this.eatTagName(tagname, isCloseTag, true));
							return this.makeLocalTagStyle('htmlTagBracket', state);
						}
					}
					break;
				}
				case '{':
					// Can't be a variable when it starts with more than 3 brackets (T108450) or
					// a single { followed by a template. E.g. {{{!}} starts a table (T292967).
					if (stream.match(/^\{\{(?!\{|[^{}]*\}\}(?!\}))\s*/u)) {
						state.nVar++;
						chain(state, this.inVariable());
						return this.makeLocalTagStyle('templateVariableBracket', state);
					} else if (stream.match(/^\{(?!\{(?!\{))\s*/u)) {
						return this.eatTransclusion(stream, state);
					}
					break;
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
							return this.makeStyle(style, state);
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
							chain(state, this.inLink(!redirect && Boolean(stream.match(this.fileRegex, false))));
							return this.makeLocalTagStyle('linkBracket', state);
						} else if (stream.match(']]')) {
							return this.makeStyle(style, state);
						}
					} else {
						const mt = stream.match(this.urlProtocols, false) as RegExpMatchArray | false;
						if (mt) {
							state.nExtLink++;
							chain(state, this.eatExternalLinkProtocol(mt[0], false));
							return this.makeLocalTagStyle('extLinkBracket', state);
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
				/** @todo consider the balance of HTML tags, including apostrophes */
				case ':': {
					const {dt} = state;
					if (dt.n && cmpNesting(dt, state, true)) {
						dt.n--;
						return this.makeLocalTagStyle('list', state);
					}
					break;
				}
				case '&':
					return this.makeStyle(this.eatEntity(stream, style), state);
				case '-':
					if (this.config.variants?.length && stream.match(/^\{(?!\{)\s*/u)) {
						chain(state, this.inConvert(style, true));
						return this.makeLocalTagStyle('convertBracket', state);
					}
				// no default
			}
			if (state.stack.length === 0) {
				if (/[^\p{L}\d_]/u.test(ch || '')) {
					// highlight free external links, bug T108448
					stream.eatWhile(/[^\p{L}\d_&'{[<~:]/u);
					const mt = stream.match(this.urlProtocols, false) as RegExpMatchArray | false;
					if (mt && !stream.match('//')) {
						chain(state, this.eatExternalLinkProtocol(mt[0]));
						return this.makeStyle(style, state);
					}
					const mtMagic = stream.match(regex, false) as RegExpMatchArray | false;
					if (mtMagic) {
						chain(state, this.inStr(mtMagic[0], 'magicLink'));
						return this.makeStyle(style, state);
					}
				}
				stream.eatWhile(/[\p{L}\d]/u);
			}
			return this.makeStyle(style, state);
		};
	}

	eatApostrophes(obj: Pick<State, 'bold' | 'italic'>): Tokenizer<string | false> {
		return (stream, state) => {
			// skip the irrelevant apostrophes ( >5 or =4 )
			if (stream.match(/^'*(?='{5})/u) || stream.match(/^'''(?!')/u, false)) {
				return false;
			} else if (stream.match("''''")) { // bold italic
				obj.bold = !obj.bold;
				obj.italic = !obj.italic;
				return this.makeLocalTagStyle('apostrophes', state);
			} else if (stream.match("''")) { // bold
				if (obj === state && state.data.firstSingleLetterWord === null) {
					this.prepareItalicForCorrection(stream, state);
				}
				obj.bold = !obj.bold;
				return this.makeLocalTagStyle('apostrophes', state);
			} else if (stream.eat("'")) { // italic
				obj.italic = !obj.italic;
				return this.makeLocalTagStyle('apostrophes', state);
			}
			return false;
		};
	}

	eatExternalLinkProtocol(chars: string, free = true): Tokenizer {
		return (stream, state) => {
			stream.match(chars);
			state.tokenize = free ? this.eatFreeExternalLink : this.inExternalLink();
			return this.makeLocalTagStyle(free ? 'freeExtLinkProtocol' : 'extLinkProtocol', state);
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
			if (stream.sol() || stream.match(/^\p{Zs}*\]/u) || isNested && peek === '|' || isArgument && peek === '=') {
				pop(state);
				return this.makeLocalTagStyle('extLinkBracket', state, 'nExtLink');
			} else if (text) {
				const chars = "[{'<-";
				return stream.match(new RegExp(`^(?:[^\\]&${pipe}${chars}]|${lookahead(chars)})+`, 'iu'))
					? this.makeTagStyle('extLinkText', state)
					: this.eatWikiText('extLinkText')(stream, state);
			} else if (stream.match(new RegExp(`^(?:${getUrlRegex(pipe)})+`, 'u'))) {
				return this.makeLocalTagStyle('extLink', state);
			}
			state.tokenize = this.inExternalLink(true);
			return '';
		};
	}

	@getTokenizer
	get eatFreeExternalLink(): Tokenizer {
		return (stream, state) => {
			const mt = stream.match(getFreeRegex()) as RegExpMatchArray;
			if (!stream.eol() && mt[0].includes('(') && getPunctuations().includes(stream.peek()!)) {
				stream.match(getFreeRegex(true));
			}
			pop(state);
			return this.makeTagStyle('freeExtLink', state);
		};
	}

	@getTokenizer
	inLink(file: boolean, section?: boolean): Tokenizer {
		const style = section ? tokens[file ? 'error' : 'linkToSection'] : `${tokens.linkPageName} ${tokens.pageName}`,
			re = section ? /^(?:[^|<[\]{}]|<(?!!--|\/?[a-z]))+/iu : /^[^#|<>[\]{}]+/u;
		let lt: number | undefined;
		return (stream, state) => {
			if (stream.sol() || lt && stream.pos > lt || stream.match(/^\s*\]\]/u)) {
				state.redirect = false;
				state.lbrack = false;
				pop(state);
				return this.makeLocalTagStyle('linkBracket', state, 'nLink');
			}
			lt = undefined;
			const space = stream.eatSpace(),
				{redirect} = state;
			if (!section && stream.match(/^#\s*/u)) {
				state.tokenize = this.inLink(file, true);
				return this.makeTagStyle(file ? 'error' : 'linkToSection', state);
			} else if (stream.match(/^\|\s*/u)) {
				state.tokenize = this.inLinkText(file);
				if (file) {
					this.toEatImageParameter(stream, state);
				}
				return this.makeLocalTagStyle(redirect ? 'error' : 'linkDelimiter', state);
			}
			let regex;
			if (redirect) {
				regex = /^(?:[<>[{}]|\](?!\]))+/u;
			} else if (section) {
				regex = /^(?:[[}]|\](?!\])|\{(?!\{))+/u;
			} else {
				regex = /^(?:[>[}]|\](?!\])|\{(?!\{)|<(?!!--|\/?[a-z]))+/iu;
			}
			if (stream.match(regex)) {
				return this.makeTagStyle('error', state);
			} else if (redirect) {
				stream.eatWhile(/[^|\]]/u);
				return this.makeStyle(style, state);
			} else if (stream.match(re) || space) {
				return this.makeStyle(style, state);
			} else if (stream.match(/^<[/a-z]/iu, false)) {
				lt = stream.pos + 1;
			}
			return this.eatWikiText(section ? style : 'error')(stream, state);
		};
	}

	@getTokenizer
	inLinkText(file: boolean, gallery?: boolean): Tokenizer {
		const linkState = {bold: false, italic: false},
			chars = `]'{<${file ? '~' : '['}-`,
			regex = new RegExp(`^(?:[^&${file ? '[|' : ''}\\${chars}]|${lookahead(chars)})+`, 'iu');
		return (stream, state) => {
			const tmpstyle = `${tokens[file ? 'fileText' : 'linkText']} ${linkState.bold ? tokens.strong : ''} ${
					linkState.italic ? tokens.em : ''
				}`,
				{redirect, lbrack} = state,
				closing = stream.match(']]');
			if (closing || !file && stream.match('[[', false)) {
				if (gallery) {
					return this.makeStyle(tmpstyle, state);
				} else if (closing && !redirect && lbrack && stream.peek() === ']') {
					stream.backUp(1);
					state.lbrack = false;
					return this.makeStyle(tmpstyle, state);
				}
				state.redirect = false;
				state.lbrack = false;
				pop(state);
				return this.makeLocalTagStyle('linkBracket', state, 'nLink');
			} else if (redirect) {
				if (!stream.skipTo(']]')) {
					stream.skipToEnd();
				}
				return this.makeLocalTagStyle('error', state);
			} else if (file && stream.match(/^\|\s*/u)) {
				this.toEatImageParameter(stream, state);
				return this.makeLocalTagStyle('linkDelimiter', state);
			} else if (stream.match(/^'(?=')/u)) {
				return this.eatApostrophes(linkState)(stream, state) || this.makeStyle(tmpstyle, state);
			} else if (file && isSolSyntax(stream, true, true) || stream.sol() && stream.match('{|', false)) {
				return this.eatWikiText(tmpstyle)(stream, state);
			}
			const mt = stream.match(regex) as RegExpMatchArray | false;
			if (lbrack === undefined && mt && mt[0].includes('[')) {
				state.lbrack = true;
			}
			return mt ? this.makeStyle(tmpstyle, state) : this.eatWikiText(tmpstyle)(stream, state);
		};
	}

	toEatImageParameter(stream: StringStream, state: State): void {
		const mt = stream.match(this.imgRegex, false) as RegExpMatchArray | false;
		if (mt) {
			chain(state, this.inStr(mt[0], 'imageParameter'));
		}
	}

	eatList(stream: StringStream, state: State): string {
		const mt = stream.match(/^[*#;:]*/u) as RegExpMatchArray,
			{dt} = state;
		if (mt[0].includes(';')) {
			dt.n = mt[0].split(';').length - 1;
			copyNesting(dt, state);
		}
		return this.makeLocalTagStyle('list', state);
	}

	eatDoubleUnderscore(style: string, stream: StringStream, state: State): Style {
		const {config: {doubleUnderscore}} = this,
			name = stream.match(/^[\p{L}\d_]+?__/u) as RegExpMatchArray | false;
		if (name) {
			if (
				Object.hasOwnProperty.call(doubleUnderscore[0], `__${name[0].toLowerCase()}`)
				|| Object.hasOwnProperty.call(doubleUnderscore[1], `__${name[0]}`)
			) {
				return tokens.doubleUnderscore;
			} else if (!stream.eol()) {
				// Two underscore symbols at the end can be the
				// beginning of another double underscored Magic Word
				stream.backUp(2);
			}
		}
		return this.makeStyle(style, state);
	}

	@getTokenizer
	get eatStartTable(): Tokenizer {
		return (stream, state) => {
			stream.match(/^(?:\{\||\{{3}\s*!\s*\}\})\s*/u);
			state.tokenize = this.inTableDefinition();
			return this.makeLocalTagStyle('tableBracket', state);
		};
	}

	@getTokenizer
	inTableDefinition(tr?: boolean, quote?: string): Tokenizer {
		const style = `${tokens.tableDefinition} mw-html-${tr ? 'tr' : 'table'}`,
			chars = '{<';
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
					state.tokenize = this.inTableDefinition(tr, quote.slice(1) || undefined);
				} else {
					stream.match(new RegExp(`^(?:[^&${chars}${equal}${quote[0]}]|${lookahead(chars)})+`, 'iu'));
				}
				return this.makeLocalTagStyle('tableDefinitionValue', state);
			} else if (quote === '') { // 无引号的属性值
				if (/\s/u.test(stream.peek() || '')) {
					state.tokenize = this.inTableDefinition(tr);
					return '';
				}
				stream.match(new RegExp(`^(?:[^\\s&${chars}${equal}]|${lookahead(chars)})+`, 'iu'));
				return this.makeLocalTagStyle('tableDefinitionValue', state);
			} else if (stream.match(/^=\s*/u)) {
				const next = stream.peek();
				state.tokenize = this.inTableDefinition(tr, /['"]/u.test(next || '') ? next!.repeat(2) : '');
				return this.makeLocalStyle(style, state);
			}
			stream.match(this.tableDefinitionRegex);
			return this.makeLocalStyle(style, state);
		};
	}

	@getTokenizer
	get inTable(): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				stream.eatSpace();
				if (stream.match(/^(?:\||\{\{\s*!\s*\}\})/u)) {
					if (stream.match(/^-+\s*/u)) {
						state.tokenize = this.inTableDefinition(true);
						return this.makeLocalTagStyle('tableDelimiter', state);
					} else if (stream.match(/^\+\s*/u)) {
						state.tokenize = this.inTableCell(tokens.tableCaption);
						return this.makeLocalTagStyle('tableDelimiter', state);
					} else if (stream.eat('}')) {
						pop(state);
						return this.makeLocalTagStyle('tableBracket', state);
					}
					stream.eatSpace();
					state.tokenize = this.inTableCell(tokens.tableTd);
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (stream.match(/^!\s*/u)) {
					state.tokenize = this.inTableCell(tokens.tableTh);
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (isSolSyntax(stream, true)) {
					return this.eatWikiText('error')(stream, state);
				}
			}
			return stream.match(this.wikiRegex)
				? this.makeTagStyle('error', state)
				: this.eatWikiText('error')(stream, state);
		};
	}

	@getTokenizer
	inTableCell(style: string, needAttr = true, firstLine = true): Tokenizer {
		const chars = "'<~_-{";
		return (stream, state) => {
			if (stream.sol()) {
				if (stream.match(/^\s*(?:[|!]|\{\{\s*!\s*\}\})/u, false)) {
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
					stream.match(/^(?:\||\{\{\s*!\s*\}\}){2}\s*/u)
					|| style === tokens.tableTh && stream.match(/^!!\s*/u)
				) {
					state.bold = false;
					state.italic = false;
					if (!needAttr) {
						state.tokenize = this.inTableCell(style);
					}
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (needAttr && stream.match(/^(?:\||\{\{\s*!\s*\}\})\s*/u)) {
					state.tokenize = this.inTableCell(style, false);
					return this.makeLocalTagStyle('tableDelimiter2', state);
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
			const re = new RegExp(
				`^(?:[^[&${firstLine ? '|!' : ':'}${equal}${chars}]|${lookahead(chars)})+`,
				'iu',
			);
			return stream.match(re) ? this.makeStyle(style, state) : this.eatWikiText(style)(stream, state);
		};
	}

	@getTokenizer
	inSectionHeader(str: string): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				pop(state);
				return '';
			} else if (stream.match(this.headerRegex)) {
				if (stream.eol()) {
					stream.backUp(str.length);
					state.tokenize = this.inStr(str, 'sectionHeader');
				} else if (stream.match(/^<!--(?!.*?-->.*?=)/u, false)) {
					// T171074: handle trailing comments
					stream.backUp(str.length);
					state.tokenize = this.inStr('<!--', false, 'sectionHeader');
				}
				return this.makeLocalTagStyle('section', state);
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
				state.tokenize = isCloseTag ? this.inStr('>', 'htmlTagBracket') : this.inHtmlTagAttribute(name);
				return this.makeLocalTagStyle('htmlTagName', state);
			}
			// it is the extension tag
			state.tokenize = isCloseTag ? this.inStr('>', 'extTagBracket') : this.inExtTagAttribute(name);
			return this.makeLocalTagStyle('extTagName', state);
		};
	}

	@getTokenizer
	inHtmlTagAttribute(name: string, quote?: string): Tokenizer {
		const style = quote === undefined ? `${tokens.htmlTagAttribute} mw-html-${name}` : tokens.htmlTagAttributeValue,
			chars = '{/';
		return (stream, state) => {
			if (stream.match(new RegExp(`^${lookahead('<', state)}`, 'iu'), false)) {
				pop(state);
				return '';
			}
			const mt = stream.match(/^\/?>/u) as RegExpMatchArray | false;
			if (mt) {
				if (!this.implicitlyClosedHtmlTags.has(name) && (mt[0] === '>' || !selfClosingTags.includes(name))) {
					state.inHtmlTag.unshift(name);
				}
				pop(state);
				return this.makeLocalTagStyle('htmlTagBracket', state);
			}
			const t = state.stack[0]!,
				pipe = (['inTemplateArgument', 'inParserFunctionArgument', 'inVariable'].includes(t.name) ? '|' : '')
				+ (t.name === 'inTemplateArgument' && t.args![0] ? '=' : '');
			if (pipe.includes(stream.peek() || '')) {
				pop(state);
				return this.makeLocalTagStyle('htmlTagBracket', state);
			} else if (stream.match(/^(?:[&<]|\{\{)/u, false)) {
				return this.eatWikiText(style)(stream, state);
			} else if (quote) { // 有引号的属性值
				if (stream.eat(quote[0]!)) {
					state.tokenize = this.inHtmlTagAttribute(name, quote.slice(1) || undefined);
				} else {
					stream.match(new RegExp(`^(?:[^<>&${chars}${pipe}${quote[0]}]|${lookahead(chars)})+`, 'u'));
				}
				return this.makeLocalTagStyle('htmlTagAttributeValue', state);
			} else if (quote === '') { // 无引号的属性值
				if (stream.sol() || /\s/u.test(stream.peek() || '')) {
					state.tokenize = this.inHtmlTagAttribute(name);
					return '';
				}
				stream.match(new RegExp(`^(?:[^\\s<>&${chars}${pipe}]|${lookahead(chars)})+`, 'u'));
				return this.makeLocalTagStyle('htmlTagAttributeValue', state);
			} else if (stream.match(/^=\s*/u)) {
				const next = stream.peek();
				state.tokenize = this.inHtmlTagAttribute(name, /['"]/u.test(next || '') ? next!.repeat(2) : '');
				return this.makeLocalStyle(style, state);
			}
			stream.match(new RegExp(`^(?:[^<>&={/${pipe}]|${lookahead('{/')})+`, 'u'));
			return this.makeLocalStyle(style, state);
		};
	}

	@getTokenizer
	inExtTagAttribute(name: string, quote?: string): Tokenizer {
		const style = `${tokens.extTagAttribute} mw-ext-${name}`;
		return (stream, state) => {
			if (stream.eat('>')) {
				state.extName = name;
				const {config: {tagModes}} = this;
				if (name in tagModes) {
					state.extMode = this[tagModes[name] as MimeTypes](state.data.tags.filter(tag => tag !== name));
				}
				if (state.extMode) {
					state.extState = state.extMode.startState!(0);
				}
				state.tokenize = this.eatExtTagArea(name);
				return this.makeLocalTagStyle('extTagBracket', state);
			} else if (stream.match('/>')) {
				pop(state);
				return this.makeLocalTagStyle('extTagBracket', state);
			} else if (quote) { // 有引号的属性值
				if (stream.eat(quote[0]!)) {
					state.tokenize = this.inExtTagAttribute(name, quote.slice(1) || undefined);
				} else {
					stream.match(new RegExp(`^(?:[^>/${quote[0]}]|${lookahead('/')})+`, 'u'));
				}
				return this.makeLocalTagStyle('extTagAttributeValue', state);
			} else if (quote === '') { // 无引号的属性值
				if (stream.sol() || /\s/u.test(stream.peek() || '')) {
					state.tokenize = this.inExtTagAttribute(name);
					return '';
				}
				stream.match(/^(?:[^>/\s]|\/(?!>))+/u);
				return this.makeLocalTagStyle('extTagAttributeValue', state);
			} else if (stream.match(/^=\s*/u)) {
				const next = stream.peek();
				state.tokenize = this.inExtTagAttribute(name, /['"]/u.test(next || '') ? next!.repeat(2) : '');
				return this.makeLocalStyle(style, state);
			}
			stream.match(/(?:[^>/=]|\/(?!>))+/u);
			return this.makeLocalStyle(style, state);
		};
	}

	@getTokenizer
	eatExtTagArea(name: string): Tokenizer {
		return (stream, state) => {
			const {pos} = stream,
				i = stream.string.slice(pos).search(
					new RegExp(`</${name}${name === 'onlyinclude' ? '>' : '\\s*(?:>|$)'}`, 'iu'),
				);
			if (i === 0) {
				stream.match('</');
				state.tokenize = this.eatTagName(name, true);
				state.extName = false;
				state.extMode = false;
				state.extState = false;
				return this.makeLocalTagStyle('extTagBracket', state);
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
				ret = `mw-tag-${state.extName} ${state.extMode.token(stream, state.extState as object)}`;
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
		const re = new RegExp(`^(?:[^|{}<${pos === 1 ? "[&~'_:-" : ''}]|\\}(?!\\}\\})|${
			pos === 1 ? lookahead("{<~'_-") : lookahead('{<', true)
		})+`, 'iu');
		return (stream, state) => {
			const sol = stream.sol();
			stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalStyle('', state);
			} else if (stream.eat('|')) {
				if (pos < 2) {
					state.tokenize = this.inVariable(pos + 1);
				}
				return this.makeLocalTagStyle('templateVariableDelimiter', state);
			} else if (stream.match('}}}')) {
				pop(state);
				return this.makeLocalTagStyle('templateVariableBracket', state, 'nVar');
			} else if (stream.match('<!--')) {
				chain(state, this.inComment);
				return this.makeLocalTagStyle('comment', state);
			} else if (pos === 0 && sol) {
				state.nVar--;
				pop(state);
				stream.pos = 0;
				return '';
			}
			return pos === 1 && isSolSyntax(stream) || !stream.match(re)
				? this.eatWikiText(tag)(stream, state)
				: this[pos === 1 ? 'makeTagStyle' : 'makeLocalTagStyle'](tag, state);
		};
	}

	eatTransclusion(stream: StringStream, state: State): string {
		// Parser function
		if (stream.peek() === '#') {
			state.nExt++;
			chain(state, this.inParserFunctionName());
			return this.makeLocalTagStyle('parserFunctionBracket', state);
		}
		// Check for parser function without '#'
		const name = stream.match(/^([^}<{|:]+)(.?)/u, false) as RegExpMatchArray | false;
		if (name) {
			const [, f, delimiter] = name as [string, string, string],
				ff = delimiter === ':' ? f : f.trim(),
				{config: {functionSynonyms}} = this;
			/** @todo {{#name}} and {{uc}} are wrong, must have ':' */
			if (
				(!delimiter || delimiter === ':' || delimiter === '}')
				&& (
					Object.hasOwnProperty.call(functionSynonyms[0], ff.toLowerCase())
					|| Object.hasOwnProperty.call(functionSynonyms[1], ff)
				)
			) {
				state.nExt++;
				chain(state, this.inParserFunctionName());
				return this.makeLocalTagStyle('parserFunctionBracket', state);
			}
		}
		// Template
		state.nTemplate++;
		chain(state, this.inTemplatePageName());
		return this.makeLocalTagStyle('templateBracket', state);
	}

	@getTokenizer
	inParserFunctionName(invoke?: boolean): Tokenizer {
		return (stream, state) => {
			const sol = stream.sol(),
				space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalStyle('', state);
			} else if (stream.eat('}')) {
				pop(state);
				return this.makeLocalTagStyle(stream.eat('}') ? 'parserFunctionBracket' : 'error', state, 'nExt');
			} else if (stream.match('<!--')) {
				chain(state, this.inComment);
				return this.makeLocalTagStyle('comment', state);
			} else if (sol) {
				state.nExt--;
				pop(state);
				stream.pos = 0;
				return '';
			}
			const ch = stream.eat(/[:|]/u);
			if (ch) {
				state.tokenize = this.inParserFunctionArgument(invoke);
				return this.makeLocalTagStyle(space || ch === '|' ? 'error' : 'parserFunctionDelimiter', state);
			}
			const mt = stream.match(/^(?:[^:}{|<>[\]\s]|\s(?!:))+/u) as RegExpMatchArray | false;
			if (mt) {
				const name = mt[0].trim().toLowerCase(),
					{config: {functionSynonyms: [insensitive]}} = this;
				if (
					name.startsWith('#')
					&& (insensitive[name] === 'invoke' || insensitive[name.slice(1)] === 'invoke')
				) {
					state.tokenize = this.inParserFunctionName(true);
				}
				return this.makeLocalTagStyle('parserFunctionName', state);
			}
			pop(state);
			return this.makeLocalStyle('', state, 'nExt');
		};
	}

	@getTokenizer
	inTemplatePageName(haveEaten?: boolean, anchor?: boolean): Tokenizer {
		const style = anchor ? tokens.error : `${tokens.templateName} ${tokens.pageName}`,
			chars = '{}<',
			re = anchor ? this.templateRegex : /^[^|{}<>[\]#]+/u;
		return (stream, state) => {
			const sol = stream.sol(),
				space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalStyle('', state);
			} else if (stream.match('}}')) {
				pop(state);
				return this.makeLocalTagStyle('templateBracket', state, 'nTemplate');
			} else if (stream.match('<!--')) {
				chain(state, this.inComment);
				return this.makeLocalTagStyle('comment', state);
			} else if (stream.eat('|')) {
				state.tokenize = this.inTemplateArgument(true);
				return this.makeLocalTagStyle('templateDelimiter', state);
			} else if (haveEaten && sol) {
				state.nTemplate--;
				pop(state);
				stream.pos = 0;
				return '';
			} else if (!anchor && stream.eat('#')) {
				state.tokenize = this.inTemplatePageName(true, true);
				return this.makeLocalTagStyle('error', state);
			} else if (!anchor && stream.match(new RegExp(`^(?:[>[\\]]|${lookahead(chars, state)})+`, 'u'))) {
				return this.makeLocalTagStyle('error', state);
			} else if (!anchor && stream.peek() === '<') {
				pop(state);
				return this.makeLocalStyle('', state, 'nTemplate');
			} else if (space && !haveEaten) {
				return this.makeLocalStyle('', state);
			} else if (stream.match(re)) {
				if (!haveEaten) {
					state.tokenize = this.inTemplatePageName(true, anchor);
				}
				return this.makeLocalStyle(style, state);
			}
			return space
				? this.makeLocalStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	@getTokenizer
	inParserFunctionArgument(module?: boolean): Tokenizer {
		const style = `${tokens.parserFunction} ${module ? tokens.pageName : ''}`,
			chars = module ? '}{<' : "}{<~'_-",
			regex = new RegExp(`^(?:[^|${module ? '' : '[&:'}${chars}]|${lookahead(chars)})+`, 'iu');
		return (stream, state) => {
			if (stream.eat('|')) {
				if (module) {
					state.tokenize = this.inParserFunctionArgument();
				}
				return this.makeLocalTagStyle('parserFunctionDelimiter', state);
			} else if (stream.match('}}')) {
				pop(state);
				return this.makeLocalTagStyle('parserFunctionBracket', state, 'nExt');
			}
			return !isSolSyntax(stream) && stream.match(regex)
				? this.makeLocalStyle(style, state)
				: this.eatWikiText('parserFunction')(stream, state);
		};
	}

	@getTokenizer
	inTemplateArgument(expectName?: boolean): Tokenizer {
		return (stream, state) => {
			const space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalTagStyle('template', state);
			} else if (stream.eat('|')) {
				if (!expectName) {
					state.tokenize = this.inTemplateArgument(true);
				}
				return this.makeLocalTagStyle('templateDelimiter', state);
			} else if (stream.match('}}')) {
				pop(state);
				return this.makeLocalTagStyle('templateBracket', state, 'nTemplate');
			} else if (stream.sol() && stream.peek() === '=') {
				const style = this.eatWikiText('template')(stream, state);
				if (style.includes(tokens.sectionHeader)) {
					return style;
				}
				stream.pos = 0;
			}
			if (expectName && stream.match(new RegExp(`^(?:[^=|}{[<]|${lookahead('}{[<', state)})*=`, 'iu'))) {
				state.tokenize = this.inTemplateArgument();
				return this.makeLocalTagStyle('templateArgumentName', state);
			} else if (isSolSyntax(stream) && stream.peek() !== '=') {
				return this.eatWikiText('template')(stream, state);
			}
			return stream.match(this.argumentRegex) || space
				? this.makeLocalTagStyle('template', state)
				: this.eatWikiText('template')(stream, state);
		};
	}

	@getTokenizer
	inConvert(style: string, needFlag?: boolean, needLang = true): Tokenizer {
		return (stream, state) => {
			const space = stream.eatSpace();
			if (stream.match('}-')) {
				pop(state);
				return this.makeLocalTagStyle('convertBracket', state);
			} else if (needFlag && stream.match(/^[;\sa-z-]*(?=\|)/iu)) {
				chain(state, this.inConvert(style));
				state.tokenize = this.inStr('|', 'convertDelimiter');
				return this.makeLocalTagStyle('convertFlag', state);
			} else if (stream.match(this.convertSemicolon)) {
				if (needFlag || !needLang) {
					state.tokenize = this.inConvert(style);
				}
				return this.makeLocalTagStyle('convertDelimiter', state);
			} else if (needLang && stream.match(this.convertLang)) {
				state.tokenize = this.inConvert(style, false, false);
				return this.makeLocalTagStyle('convertLang', state);
			}
			return !isSolSyntax(stream, true) && stream.match(this.convertRegex) || space
				? this.makeStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	eatEntity(stream: StringStream, style: string): string {
		const entity = stream.match(/^(?:#x[a-f\d]+|#\d+|[a-z\d]+);/iu) as RegExpMatchArray | false;
		return entity && isHtmlEntity(entity[0]) ? tokens.htmlEntity : style;
	}

	/**
	 * Remembers position and status for rollbacking.
	 * It is needed for changing from bold to italic with apostrophes before it, if required.
	 *
	 * @see https://phabricator.wikimedia.org/T108455
	 * @param stream
	 * @param state
	 */
	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	prepareItalicForCorrection(stream: StringStream, state: State): void {
		// See Parser::doQuotes() in MediaWiki Core, it works similarly.
		// this.firstSingleLetterWord has maximum priority
		// this.firstMultiLetterWord has medium priority
		// this.firstSpace has low priority
		const end = stream.pos,
			str = stream.string.slice(0, end - 3),
			x1 = str.slice(-1),
			x2 = str.slice(-2, -1),
			{data} = state;
		// this.firstSingleLetterWord always is undefined here
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
	}

	/**
	 * main entry
	 *
	 * @see https://codemirror.net/docs/ref/#language.StreamParser
	 *
	 * @param tags
	 */
	mediawiki(tags = this.tags): StreamParser<State> {
		return {
			name: 'mediawiki',

			startState: () => startState(this.eatWikiText(''), tags),

			copyState,

			token: (stream, state): string => {
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
					// just send saved tokens till they exists
					Object.assign(state, other);
					if (
						!state.extMode && state.nLink === 0
						&& typeof style === 'string' && style.includes(tokens.apostrophes)
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
							return this.makeFullStyle(s, state);
						}
						const length = pos - stream.pos;
						if (length !== 3) {
							state.italic = !state.italic;
						}
						if (length !== 2) {
							state.bold = !state.bold;
						}
					}
					// return first saved token
					data.oldToken = readyTokens.shift()!;
					stream.pos = pos;
					stream.string = string;
					return this.makeFullStyle(style, state);
				} else if (stream.sol()) {
					// reset bold and italic status in every new line
					state.bold = false;
					state.italic = false;
					state.dt.n = 0;
					data.firstSingleLetterWord = null;
					data.firstMultiLetterWord = null;
					data.firstSpace = null;
				}
				readyTokens.length = 0;
				data.mark = null;
				data.oldToken = {pos: stream.pos, string: stream.string, state: copyState(state), style: ''};
				let style: Style;
				do {
					// get token style
					style = state.tokenize(stream, state);
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
									type = !local && s[0].split(' ').find(t => t && !t.endsWith('-ground'));
								if (type && type.startsWith('mw-table-')) {
									token.style = `${s[0].replace('mw-table-', 'mw-html-')} ${tokens.tableDefinition}`;
								} else if (local && s.includes(tokens.tableDelimiter)) {
									break;
								}
							}
						}
					}
					// save token
					readyTokens.push({pos: stream.pos, string: stream.string, state: copyState(state), style});
				} while (!stream.eol());
				if (!state.bold || !state.italic) {
					// no need to rollback
					data.mark = null;
				}
				stream.pos = data.oldToken.pos;
				stream.string = data.oldToken.string;
				Object.assign(state, data.oldToken.state);
				return '';
			},

			blankLine(state): void {
				if (state.extMode && state.extMode.blankLine) {
					state.extMode.blankLine(state.extState as State, 0);
				}
			},

			tokenTable: {
				...this.tokenTable,
				...this.hiddenTable,
				'': Tag.define(),
			},
		};
	}

	'text/nowiki'(): StreamParser<Record<string, never>> {
		return {
			startState: () => ({}),

			token: (stream): string => {
				if (stream.eatWhile(/[^&]/u)) {
					return '';
				}
				// eat &
				stream.next();
				return this.eatEntity(stream, '');
			},
		};
	}

	inReferences(tag: string, comment?: boolean): Tokenizer<string> {
		const re = new RegExp(`^(?:[^<]|<(?!${comment ? '!--|' : ''}${tag}(?:[\\s/>]|$)))+`, 'iu');
		return (stream, state) => {
			if (comment && stream.match('<!--')) {
				chain(state, this.inComment);
				return this.makeLocalTagStyle('comment', state);
			} else if (stream.match(re)) {
				return tokens.comment;
			}
			stream.eat('<');
			chain(state, this.eatTagName(tag));
			return tokens.extTagBracket;
		};
	}

	'text/references'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inReferences('ref', true), tags),

			token: simpleToken,
		};
	}

	'text/choose'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inReferences('option'), tags),

			token: simpleToken,
		};
	}

	'text/combobox'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inReferences('combooption'), tags),

			token: simpleToken,
		};
	}

	@getTokenizer<string>
	get inInputbox(): Tokenizer<string> {
		return (stream, state) => {
			if (stream.match(/^\{{3}(?!\{)\s*/u)) {
				chain(state, this.inVariable());
				return tokens.templateVariableBracket;
			} else if (stream.match(/^\{\{\s*/u)) {
				return this.eatTransclusion(stream, state);
			}
			stream.match(/^(?:[^{]|\{(?!\{))+/u);
			return '';
		};
	}

	'text/inputbox'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inInputbox, tags),

			token: simpleToken,
		};
	}

	@getTokenizer
	inGallery(section?: boolean): Tokenizer {
		const style = section ? tokens.error : `${tokens.linkPageName} ${tokens.pageName}`,
			regex = section ? /^(?:[[}\]]|\{(?!\{))+/u : /^(?:[>[}\]]|\{(?!\{)|<(?!!--))+/u,
			re = section ? /^(?:[^|<[\]{}]|<(?!!--))+/u : /^[^#|<>[\]{}]+/u;
		return (stream, state) => {
			const space = stream.eatSpace();
			if (!section && stream.match(/^#\s*/u)) {
				state.tokenize = this.inGallery(true);
				return this.makeTagStyle('error', state);
			} else if (stream.match(/^\|\s*/u)) {
				state.tokenize = this.inLinkText(true, true);
				this.toEatImageParameter(stream, state);
				return this.makeLocalTagStyle('linkDelimiter', state);
			} else if (stream.match(regex)) {
				return this.makeTagStyle('error', state);
			}
			return stream.match(re) || space
				? this.makeStyle(style, state)
				: this.eatWikiText(section ? style : 'error')(stream, state);
		};
	}

	'text/gallery'(tags: string[]): StreamParser<State> {
		return {
			startState: () => startState(this.inGallery(), tags),

			token: (stream, state): string => {
				if (stream.sol()) {
					Object.assign(state, startState(this.inGallery(), state.data.tags));
				}
				return simpleToken(stream, state);
			},
		};
	}
}
