/**
 * @author pastakhov, MusikAnimal and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {
	HighlightStyle,
	LanguageSupport,
	StreamLanguage,
	syntaxHighlighting,
	syntaxTree,
} from '@codemirror/language';
import {Tag} from '@lezer/highlight';
import modeConfig from './config';
import * as plugins from './plugins';
import type {StreamParser, StringStream, TagStyle} from '@codemirror/language';
import type {
	CloseBracketConfig,
	CompletionSource,
	Completion,
} from '@codemirror/autocomplete';
import type {CommentTokens} from '@codemirror/commands';
import type {Highlighter} from '@lezer/highlight';

const {htmlTags, voidHtmlTags, tokenTable, tokens, htmlAttrs, elementAttrs, extAttrs} = modeConfig;

declare type MimeTypes = 'mediawiki' | 'text/mediawiki';
declare type Style = string | [string];
declare type Tokenizer<T = Style> = (stream: StringStream, state: State) => T;
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

const enum TableCell {
	Td,
	Th,
	Caption,
}

/**
 * 比较两个嵌套状态是否相同
 * @param a
 * @param b
 */
const cmpNesting = (a: Partial<Nesting>, b: Nesting): boolean =>
	a.nTemplate === b.nTemplate
	&& a.nExt === b.nExt
	&& a.nVar === b.nVar
	&& a.nLink === b.nLink
	&& a.nExtLink === b.nExtLink
	&& a.extName === b.extName
	&& (a.extName !== 'mediawiki' || cmpNesting(a.extState as Partial<Nesting>, b.extState as Nesting));

/**
 * 复制嵌套状态
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
	if (a.extName === 'mediawiki') {
		a.extState = {};
		copyNesting(a.extState, b.extState as Nesting);
	}
};

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
			Object.assign(newState, {[key]: typeof val === 'object' ? {...val} : val});
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
	state.stack.push(state.tokenize);
	state.tokenize = tokenizer;
};

/**
 * 更新内部 Tokenizer
 * @param state
 */
const pop = (state: State): void => {
	state.tokenize = state.stack.pop()!;
};

/**
 * 是否为行首语法
 * @param stream
 */
const isSolSyntax = (stream: StringStream): boolean => stream.sol() && /[-=*#;:]/u.test(stream.peek() || '');

/**
 * 获取外部链接正则表达式
 * @param punctuations 标点符号
 */
const getUrlRegex = (punctuations = ''): string =>
	`[^&~{'\\p{Zs}[\\]<>"${punctuations}]|&(?![lg]t;)|~~?(?!~)|\\{(?!\\{)|'(?!')`;

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

/**
 * 判断节点是否包含指定类型
 * @param types 节点类型
 * @param names 指定类型
 */
const hasTag = (types: Set<string>, names: string | string[]): boolean =>
	(Array.isArray(names) ? names : [names]).some(name => types.has(name in tokens ? tokens[name as TagName] : name));

/** Adapted from the original CodeMirror 5 stream parser by Pavel Astakhov */
export class MediaWiki {
	/** 已解析的节点 */
	declare readonly readyTokens: Token[];

	/** 当前起始位置 */
	declare oldToken: Token | null;

	/** 可能需要回滚的`'''` */
	declare mark: number | null;

	declare readonly config;
	declare firstSingleLetterWord: number | null;
	declare firstMultiLetterWord: number | null;
	declare firstSpace: number | null;
	declare readonly tokenTable;
	declare readonly hiddenTable: Record<string, Tag>;
	declare readonly permittedHtmlTags;
	declare readonly implicitlyClosedHtmlTags;
	declare readonly urlProtocols;
	declare readonly fileRegex;
	declare readonly nsRegex;
	declare readonly redirectRegex;
	declare readonly imgRegex;
	declare readonly functionSynonyms: Completion[];
	declare readonly doubleUnderscore: Completion[];
	declare readonly extTags: Completion[];
	declare readonly htmlTags: Completion[];
	declare readonly protocols: Completion[];
	declare readonly imgKeys: Completion[];
	declare readonly htmlAttrs: Completion[];
	declare readonly elementAttrs: Map<string | undefined, Completion[]>;
	declare readonly extAttrs: Map<string, Completion[]>;

	constructor(config: MwConfig) {
		const {
				urlProtocols,
				permittedHtmlTags,
				implicitlyClosedHtmlTags,
				tags,
				nsid,
				functionSynonyms,
				doubleUnderscore,
				redirection = ['#REDIRECT'],
			} = config,
			img = Object.keys(config.img || {}).filter(word => !/\$1./u.test(word)),
			extTags = Object.keys(tags);
		this.config = config;
		this.firstSingleLetterWord = null;
		this.firstMultiLetterWord = null;
		this.firstSpace = null;
		this.readyTokens = [];
		this.oldToken = null;
		this.mark = null;
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
		this.fileRegex = new RegExp(`^(?:${
			Object.entries(nsid).filter(([, id]) => id === 6).map(([ns]) => ns).join('|')
		})\\s*:`, 'iu');
		this.nsRegex = new RegExp(`^(${
			Object.keys(nsid).filter(Boolean).join('|').replace(/_/gu, ' ')
		})\\s*:\\s*`, 'iu');
		this.redirectRegex = new RegExp(`^(?:${
			redirection.map(s => s.slice(1)).join('|')
		})(?:\\s*:)?\\s*(?=\\[\\[)`, 'iu');
		this.imgRegex = new RegExp(`^(?:${
			img.filter(word => word.endsWith('$1')).map(word => word.slice(0, -2)).join('|')
		}|(?:${
			img.filter(word => !word.endsWith('$1')).join('|')
		})\\s*(?=\\||\\]\\]|$))`, 'u');
		this.functionSynonyms = functionSynonyms.flatMap((obj, i) => Object.keys(obj).map(label => ({
			type: i ? 'constant' : 'function',
			label,
		})));
		this.doubleUnderscore = doubleUnderscore.flatMap(Object.keys).map(label => ({
			type: 'constant',
			label,
		}));
		this.extTags = extTags.map(label => ({type: 'type', label}));
		this.htmlTags = htmlTags.filter(tag => !extTags.includes(tag)).map(label => ({
			type: 'type',
			label,
		}));
		this.protocols = urlProtocols.split('|').map(label => ({
			type: 'namespace',
			label: label.replace(/\\\//gu, '/'),
		}));
		this.imgKeys = img.map(label => label.endsWith('$1')
			? {type: 'property', label: label.slice(0, -2), detail: '$1'}
			: {type: 'keyword', label});
		this.htmlAttrs = [
			...htmlAttrs.map(label => ({type: 'property', label})),
			{type: 'variable', label: 'data-', detail: '*'},
			{type: 'namespace', label: 'xmlns:', detail: '*'},
		];
		this.elementAttrs = new Map();
		for (const [key, value] of Object.entries(elementAttrs)) {
			this.elementAttrs.set(key, value.map(label => ({type: 'property', label})));
		}
		this.extAttrs = new Map();
		for (const [key, value] of Object.entries(extAttrs)) {
			this.extAttrs.set(key, value.map(label => ({type: 'property', label})));
		}
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
		(this[hidden ? 'hiddenTable' : 'tokenTable'][`mw-${token}`] as Tag | undefined) ||= Tag.define(parent);
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
		for (const tag of Object.keys(this.config.tags)) {
			this.addToken(`tag-${tag}`, tag !== 'nowiki' && tag !== 'pre');
			this.addToken(`ext-${tag}`, true);
		}
		for (const tag of this.permittedHtmlTags) {
			this.addToken(`html-${tag}`, true);
		}
		this.addToken('file-text', true);
	}

	/**
	 * This defines the actual CSS class assigned to each tag/token.
	 *
	 * @see https://codemirror.net/docs/ref/#language.TagStyle
	 */
	getTagStyles(): TagStyle[] {
		return Object.keys(this.tokenTable).map(className => ({
			tag: this.tokenTable[className]!,
			class: `cm-${className}`,
		}));
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

	/**
	 * @todo 添加stage参数
	 * @ignore
	 */
	eatWikiText(style: string): Tokenizer {
		if (style in tokens) {
			style = tokens[style as TagName]; // eslint-disable-line no-param-reassign
		}
		return (stream, state) => {
			let ch: string;
			if (stream.eol()) {
				return '';
			} else if (stream.sol()) {
				if (stream.match('//')) {
					return this.makeStyle(style, state);
				}
				const mtFree = stream.match(this.urlProtocols, false) as RegExpMatchArray | false;
				if (mtFree) {
					chain(state, this.eatExternalLinkProtocol(mtFree[0]));
					return '';
				}
				ch = stream.next()!;
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
						if (stream.match(/^:*\s*(?=\{\||\{{3}\s*!\s*\}\})/u)) {
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
							chain(state, this.inSectionHeader(tmp[3]!.length));
							return this.makeLocalStyle(
								`${tokens.sectionHeader} mw-section--${tmp[1]!.length + 1}`,
								state,
							);
						}
						break;
					}
					case ' ': {
						// Leading spaces is valid syntax for tables, bug T108454
						const mt = stream.match(/^\s*(:+\s*)?(?=\{\||\{{3}\s*!\s*\}\})/u) as RegExpMatchArray | false;
						if (mt) {
							if (mt[1]) { // ::{|
								chain(state, this.eatStartTable);
								return this.makeLocalTagStyle('list', state);
							}
							stream.eat('{');
						} else {
							/** @todo indent-pre is sometimes suppressed */
							return tokens.skipFormatting;
						}
					}
					// fall through
					case '{':
						if (stream.match(/^(?:\||\{\{\s*!\s*\}\})\s*/u)) {
							chain(state, this.inTableDefinition());
							return this.makeLocalTagStyle('tableBracket', state);
						}
						break;
					case '-':
						if (stream.match(/^-{3,}/u)) {
							return tokens.hr;
						}
					// no default
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
					if (stream.match('!--', false)) { // comment
						stream.backUp(1);
						chain(state, this.inComment);
						return '';
					}
					const isCloseTag = Boolean(stream.eat('/')),
						mt = stream.match(/^[a-z][^\s/>]*/iu, false) as RegExpMatchArray | false;
					if (mt) {
						const tagname = mt[0].toLowerCase();
						if (tagname in this.config.tags) {
							// Extension tag
							if (isCloseTag) {
								chain(state, this.inStr('>', 'error'));
								return this.makeLocalTagStyle('error', state);
							}
							chain(state, this.eatTagName(tagname, isCloseTag));
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
						chain(state, this.inVariable);
						return this.makeLocalTagStyle('templateVariableBracket', state);
					} else if (stream.match(/^\{(?!\{(?!\{))\s*/u)) {
						// Parser function
						if (stream.peek() === '#') {
							state.nExt++;
							chain(state, this.inParserFunctionName(true));
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
								&& (ff.toLowerCase() in functionSynonyms[0] || ff in functionSynonyms[1])
							) {
								state.nExt++;
								chain(state, this.inParserFunctionName(true));
								return this.makeLocalTagStyle('parserFunctionBracket', state);
							}
						}
						// Template
						state.nTemplate++;
						chain(state, this.inTemplatePageName());
						return this.makeLocalTagStyle('templateBracket', state);
					}
					break;
				// Maybe double underscored Magic Word such as __TOC__
				case '_': {
					let tmp = 1;
					// Optimize processing of many underscore symbols
					while (stream.eat('_')) {
						tmp++;
					}
					// Many underscore symbols
					if (tmp > 2) {
						if (!stream.eol()) {
							// Leave last two underscore symbols for processing in next iteration
							stream.backUp(2);
						}
						// Optimization: skip regex function for EOL and backup-ed symbols
						return this.makeStyle(style, state);
					// Check on double underscore Magic Word
					} else if (tmp === 2) {
						// The same as the end of function except '_' inside and '__' at the end.
						const name = stream.match(/^[\p{L}\d_]+?__/u) as RegExpMatchArray | false;
						if (name) {
							const {config: {doubleUnderscore}} = this;
							if (
								`__${name[0].toLowerCase()}` in doubleUnderscore[0]
								|| `__${name[0]}` in doubleUnderscore[1]
							) {
								return tokens.doubleUnderscore;
							} else if (!stream.eol()) {
								// Two underscore symbols at the end can be the
								// beginning of another double underscored Magic Word
								stream.backUp(2);
							}
							// Optimization: skip regex for EOL and backup-ed symbols
							return this.makeStyle(style, state);
						}
					}
					break;
				}
				case '[':
					// Link Example: [[ Foo | Bar ]]
					if (stream.match(new RegExp(`^\\[(?!${this.config.urlProtocols})\\s*`, 'iu'))) {
						const {redirect} = state;
						if (redirect || /[^[\]|]/u.test(stream.peek() || '')) {
							state.nLink++;
							state.lbrack = undefined;
							chain(state, this.inLink(!redirect && Boolean(stream.match(this.fileRegex, false))));
							return this.makeLocalTagStyle('linkBracket', state);
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
					if (dt.n && cmpNesting(dt, state)) {
						dt.n--;
						return this.makeLocalTagStyle('list', state);
					}
					break;
				}
				case '&':
					return this.makeStyle(this.eatEntity(stream, style), state);
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
				if (this.firstSingleLetterWord === null && obj === state) {
					this.prepareItalicForCorrection(stream);
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

	inExternalLink(text?: boolean): Tokenizer {
		const regex = new RegExp(`^(?:${getUrlRegex()})+`, 'u');
		return (stream, state) => {
			if (stream.sol() || stream.match(/^\p{Zs}*\]/u)) {
				pop(state);
				return this.makeLocalTagStyle('extLinkBracket', state, 'nExtLink');
			} else if (text) {
				return stream.match(/^(?:[^'[\]{&<]|\[(?!\[)|\{(?!\{)|'(?!')|<(?![!/a-z]))+/iu)
					? this.makeTagStyle('extLinkText', state)
					: this.eatWikiText('extLinkText')(stream, state);
			} else if (stream.match(regex)) {
				return this.makeLocalTagStyle('extLink', state);
			}
			state.tokenize = this.inExternalLink(true);
			return '';
		};
	}

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

	inLink(file: boolean, section?: boolean): Tokenizer {
		const style = section ? tokens[file ? 'error' : 'linkToSection'] : `${tokens.linkPageName} ${tokens.pageName}`;
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
				regex = /^(?:[>[}]|\](?!\])|\{(?!\{)|<(?![!/a-z]))+/iu;
			}
			if (stream.match(regex)) {
				return this.makeTagStyle('error', state);
			} else if (redirect) {
				stream.eatWhile(/[^|\]]/u);
				return this.makeStyle(style, state);
			}
			if (stream.eatWhile(section ? /[^|<[\]{}]|<(?![!/a-z])/iu : /[^#|<>[\]{}]/u) || space) {
				return this.makeStyle(style, state);
			}
			if (stream.match(/^<[a-z]/iu, false)) {
				lt = stream.pos + 1;
			}
			return this.eatWikiText(section ? style : 'error')(stream, state);
		};
	}

	inLinkText(file: boolean): Tokenizer {
		const linkState = {bold: false, italic: false},
			regex = file
				? /^(?:[^'\]{&<[~|]|'(?!')|\](?!\])|\{(?!\{)|<(?![!/a-z])|~~?(?!~))+/iu
				: /^(?:[^'\]{&<[]|'(?!')|\](?!\])|\{(?!\{)|<(?![!/a-z])|\[(?!\[))+/iu;
		return (stream, state) => {
			const tmpstyle = `${tokens.linkText} ${linkState.bold ? tokens.strong : ''} ${
					linkState.italic ? tokens.em : ''
				} ${file ? 'mw-file-text' : ''}`,
				{redirect, lbrack} = state,
				closing = stream.match(']]');
			if (closing || !file && stream.match('[[', false)) {
				if (closing && !redirect && lbrack && stream.peek() === ']') {
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

	inSectionHeader(count: number): Tokenizer {
		return (stream, state) => {
			if (stream.eatWhile(/[^&<[{~'_]/u)) {
				if (stream.eol()) {
					stream.backUp(count);
					state.tokenize = this.eatSectionHeader;
				} else if (stream.match(/^<!--(?!.*?-->.*?=)/u, false)) {
					// T171074: handle trailing comments
					stream.backUp(count);
					state.tokenize = this.inStr('<!--', false, 'sectionHeader');
				}
				return this.makeLocalTagStyle('section', state);
			}
			return this.eatWikiText('section')(stream, state);
		};
	}

	get eatSectionHeader(): Tokenizer {
		return (stream, state) => {
			stream.skipToEnd();
			pop(state);
			return this.makeLocalTagStyle('sectionHeader', state);
		};
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

	get eatStartTable(): Tokenizer {
		return (stream, state) => {
			stream.match(/^(?:\{\||\{{3}\s*!\s*\}\})\s*/u);
			state.tokenize = this.inTableDefinition();
			return this.makeLocalTagStyle('tableBracket', state);
		};
	}

	inTableDefinition(tr?: boolean): Tokenizer {
		const style = `${tokens.tableDefinition} mw-html-${tr ? 'tr' : 'table'}`;
		return (stream, state) => {
			if (stream.sol()) {
				state.tokenize = this.inTable;
				return '';
			}
			return stream.eatWhile(/[^&{<]/u)
				? this.makeLocalStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	get inTable(): Tokenizer {
		return (stream, state) => {
			if (stream.sol()) {
				stream.eatSpace();
				if (stream.match(/^(?:\||\{\{\s*!\s*\}\})/u)) {
					if (stream.match(/^-+\s*/u)) {
						state.tokenize = this.inTableDefinition(true);
						return this.makeLocalTagStyle('tableDelimiter', state);
					} else if (stream.match(/^\+\s*/u)) {
						state.tokenize = this.inTableCell(true, TableCell.Caption);
						return this.makeLocalTagStyle('tableDelimiter', state);
					} else if (stream.eat('}')) {
						pop(state);
						return this.makeLocalTagStyle('tableBracket', state);
					}
					stream.eatSpace();
					state.tokenize = this.inTableCell(true, TableCell.Td);
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (stream.match(/^!\s*/u)) {
					state.tokenize = this.inTableCell(true, TableCell.Th);
					return this.makeLocalTagStyle('tableDelimiter', state);
				}
			}
			return this.eatWikiText('error')(stream, state);
		};
	}

	inTableCell(needAttr: boolean, type: TableCell, firstLine = true): Tokenizer {
		let style = '';
		if (type === TableCell.Caption) {
			style = tokens.tableCaption;
		} else if (type === TableCell.Th) {
			style = tokens.strong;
		}
		return (stream, state) => {
			if (stream.sol()) {
				if (stream.match(/^\s*(?:[|!]|\{\{\s*!\s*\}\})/u, false)) {
					state.tokenize = this.inTable;
					return '';
				} else if (firstLine) {
					state.tokenize = this.inTableCell(false, type, false);
					return '';
				} else if (isSolSyntax(stream)) {
					return this.eatWikiText(style)(stream, state);
				}
			}
			if (stream.eatWhile(firstLine ? /[^'{[<&~_|!]/u : /[^'{[<&~_:]/u)) {
				return this.makeStyle(style, state);
			} else if (firstLine) {
				if (
					stream.match(/^(?:\||\{\{\s*!\s*\}\}){2}\s*/u)
					|| type === TableCell.Th && stream.match(/^!!\s*/u)
				) {
					state.bold = false;
					state.italic = false;
					state.tokenize = this.inTableCell(true, type);
					return this.makeLocalTagStyle('tableDelimiter', state);
				} else if (needAttr && stream.match(/^(?:\||\{\{\s*!\s*\}\})\s*/u)) {
					state.tokenize = this.inTableCell(false, type);
					return this.makeLocalTagStyle('tableDelimiter2', state);
				}
			}
			return this.eatWikiText(style)(stream, state);
		};
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	eatEntity(stream: StringStream, style: string): string {
		const entity = stream.match(/^(?:#x[a-f\d]+|#\d+|[a-z\d]+);/iu) as RegExpMatchArray | false;
		return entity && isHtmlEntity(entity[0]) ? tokens.htmlEntity : style;
	}

	get inVariable(): Tokenizer {
		return (stream, state) => {
			if (stream.eat('|')) {
				state.tokenize = this.inVariableDefault(true);
				return this.makeLocalTagStyle('templateVariableDelimiter', state);
			} else if (stream.match('}}}')) {
				pop(state);
				return this.makeLocalTagStyle('templateVariableBracket', state, 'nVar');
			} else if (stream.match('{{{')) {
				state.stack.push(state.tokenize);
				return this.makeLocalTagStyle('templateVariableBracket', state);
			} else if (stream.match('<!--', false)) {
				chain(state, this.inComment);
				return '';
			} else if (!stream.eatWhile(/[^{}|<]/u)) {
				stream.next();
			}
			return this.makeLocalTagStyle('templateVariableName', state);
		};
	}

	inVariableDefault(isFirst?: boolean): Tokenizer {
		const style = tokens[isFirst ? 'templateVariable' : 'comment'];
		return (stream, state) => {
			if (stream.match('}}}')) {
				pop(state);
				return this.makeLocalTagStyle('templateVariableBracket', state, 'nVar');
			} else if (stream.eat('|')) {
				if (isFirst) {
					state.tokenize = this.inVariableDefault();
				}
				return this.makeLocalTagStyle('templateVariableDelimiter', state);
			}
			return isFirst && isSolSyntax(stream) || !stream.eatWhile(isFirst ? /[^|{}[<&~'_:]/u : /[^|{}[<]/u)
				? this.eatWikiText(style)(stream, state)
				: this.makeStyle(style, state);
		};
	}

	get inComment(): Tokenizer {
		return this.inStr('-->', 'comment', 'comment');
	}

	inParserFunctionName(sameLine?: boolean, invoke?: boolean): Tokenizer {
		return (stream, state) => {
			if (sameLine && stream.sol()) {
				state.tokenize = this.inParserFunctionName();
				return '';
			}
			const space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalStyle('', state);
			} else if (stream.match('<!--', false)) {
				chain(state, this.inComment);
				return this.makeLocalTagStyle('parserFunctionName', state);
			} else if (stream.eat('}') || !sameLine) {
				pop(state);
				return this.makeLocalTagStyle(stream.eat('}') ? 'parserFunctionBracket' : 'error', state, 'nExt');
			}
			const ch = stream.eat(/[:|]/u);
			if (ch) {
				state.tokenize = this.inParserFunctionArguments(invoke);
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
					state.tokenize = this.inParserFunctionName(true, true);
				}
				return this.makeLocalTagStyle('parserFunctionName', state);
			}
			pop(state);
			return this.makeLocalStyle('', state, 'nExt');
		};
	}

	inParserFunctionArguments(module?: boolean): Tokenizer {
		const style = `${tokens.parserFunction} ${module ? tokens.pageName : ''}`;
		return (stream, state) => {
			if (stream.eat('|')) {
				if (module) {
					state.tokenize = this.inParserFunctionArguments();
				}
				return this.makeLocalTagStyle('parserFunctionDelimiter', state);
			} else if (stream.match('}}')) {
				pop(state);
				return this.makeLocalTagStyle('parserFunctionBracket', state, 'nExt');
			}
			return isSolSyntax(stream) || !stream.eatWhile(module ? /[^|}{[<]/u : /[^|}{[<&~'_:]/u)
				? this.eatWikiText('parserFunction')(stream, state)
				: this.makeLocalStyle(style, state);
		};
	}

	inTemplatePageName(haveEaten?: boolean, anchor?: boolean): Tokenizer {
		const style = anchor ? tokens.error : `${tokens.templateName} ${tokens.pageName}`;
		return (stream, state) => {
			const sol = stream.sol(),
				space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalStyle(style, state);
			} else if (stream.eat('|')) {
				state.tokenize = this.inTemplateArgument(true);
				return this.makeLocalTagStyle('templateDelimiter', state);
			} else if (stream.match('}}')) {
				pop(state);
				return this.makeLocalTagStyle('templateBracket', state, 'nTemplate');
			} else if (stream.match('<!--', false)) {
				chain(state, this.inComment);
				return this.makeLocalStyle('', state);
			} else if (haveEaten && !anchor && sol) {
				state.nTemplate--;
				pop(state);
				stream.pos = 0;
				return '';
			} else if (!anchor && stream.eat('#')) {
				state.tokenize = this.inTemplatePageName(true, true);
				return this.makeLocalTagStyle('error', state);
			} else if (stream.match(anchor ? /^(?:[^|{}<]|([{}])(?!\1)|<(?!!--))+/u : /^[^|{}<>[\]#]+/u)) {
				state.tokenize = this.inTemplatePageName(true, anchor);
				return this.makeLocalStyle(style, state);
			} else if (stream.match(/^(?:[<>[\]}]|\{(?!\{))/u)) {
				return this.makeLocalTagStyle('error', state);
			}
			return space
				? this.makeLocalStyle(style, state)
				: this.eatWikiText(style)(stream, state);
		};
	}

	inTemplateArgument(expectName?: boolean): Tokenizer {
		const regex = new RegExp(
			`^(?:[^=|}{[<]|\\[(?!\\[)|<(?!!--|(?:${Object.keys(this.config.tags).join('|')})[\\s/>]))*=`,
			'iu',
		);
		return (stream, state) => {
			const space = stream.eatSpace();
			if (stream.eol()) {
				return this.makeLocalTagStyle('template', state);
			} else if (stream.eat('|')) {
				state.tokenize = this.inTemplateArgument(true);
				return this.makeLocalTagStyle('templateDelimiter', state);
			} else if (stream.match('}}')) {
				pop(state);
				return this.makeLocalTagStyle('templateBracket', state, 'nTemplate');
			} else if (expectName && stream.match(regex)) {
				state.tokenize = this.inTemplateArgument();
				return this.makeLocalTagStyle('templateArgumentName', state);
			}
			return !isSolSyntax(stream) && stream.eatWhile(/[^|}{[<&~'_:]/u) || space
				? this.makeLocalTagStyle('template', state)
				: this.eatWikiText('template')(stream, state);
		};
	}

	eatTagName(chars: string, isCloseTag?: boolean, isHtmlTag?: boolean): Tokenizer {
		return (stream, state) => {
			stream.match(new RegExp(`^${chars}`, 'iu'));
			stream.eatSpace();
			const name = chars.toLowerCase();
			if (isHtmlTag) {
				state.tokenize = isCloseTag ? this.inStr('>', 'htmlTagBracket') : this.inHtmlTagAttribute(name);
				return this.makeLocalTagStyle('htmlTagName', state);
			}
			// it is the extension tag
			state.tokenize = isCloseTag ? this.inStr('>', 'extTagBracket') : this.inExtTagAttribute(name);
			return this.makeLocalTagStyle('extTagName', state);
		};
	}

	inHtmlTagAttribute(name: string): Tokenizer {
		const style = `${tokens.htmlTagAttribute} mw-html-${name}`;
		return (stream, state) => {
			if (stream.match(/^(?:"[^<">]*"|'[^<'>]*'[^>/<{])+/u)) {
				return this.makeLocalStyle(style, state);
			} else if (stream.peek() === '<') {
				pop(state);
				return '';
			} else if (stream.match(/^\/?>/u)) {
				if (!this.implicitlyClosedHtmlTags.has(name)) {
					state.inHtmlTag.unshift(name);
				}
				pop(state);
				return this.makeLocalTagStyle('htmlTagBracket', state);
			}
			return this.eatWikiText(style)(stream, state);
		};
	}

	get eatNowiki(): Tokenizer<string> {
		return stream => {
			if (stream.eatWhile(/[^&]/u)) {
				return '';
			}
			// eat &
			stream.next();
			return this.eatEntity(stream, '');
		};
	}

	inExtTagAttribute(name: string): Tokenizer {
		const style = `${tokens.extTagAttribute} mw-ext-${name}`;
		return (stream, state) => {
			if (stream.match(/^(?:"[^">]*"|'[^'>]*'|[^>/])+/u)) {
				return this.makeLocalStyle(style, state);
			} else if (stream.eat('>')) {
				state.extName = name;
				const {config: {tagModes, tags}} = this;
				if (name === 'nowiki' || name === 'pre') {
					// There's no actual processing within these tags (apart from HTML entities),
					// so startState and copyState can be no-ops.
					state.extMode = {
						startState: () => ({}),
						token: this.eatNowiki,
					};
				} else if (name in tagModes) {
					const innerTags = {...tags};
					delete innerTags[name];
					state.extMode = new MediaWiki({...this.config, tags: innerTags})[tagModes[name] as MimeTypes];
				}
				if (state.extMode) {
					state.extState = state.extMode.startState!(0);
				}
				state.tokenize = this.eatExtTagArea(name);
				return this.makeLocalTagStyle('extTagBracket', state);
			} else if (stream.match('/>')) {
				pop(state);
				return this.makeLocalTagStyle('extTagBracket', state);
			}
			stream.next();
			return this.makeLocalStyle(style, state);
		};
	}

	eatExtTagArea(name: string): Tokenizer {
		return (stream, state) => {
			const from = stream.pos,
				m = new RegExp(`</${name}\\s*(?:>|$)`, 'iu').exec(from ? stream.string.slice(from) : stream.string);
			let origString: string | false = false;
			if (m) {
				if (m.index === 0) {
					state.tokenize = this.eatExtCloseTag(name);
					state.extName = false;
					if (state.extMode) {
						state.extMode = false;
						state.extState = false;
					}
					return '';
				}
				origString = stream.string;
				stream.string = origString.slice(0, m.index + from);
			}
			chain(state, this.inExtTokens(origString));
			return '';
		};
	}

	eatExtCloseTag(name: string): Tokenizer {
		return (stream, state) => {
			stream.next(); // eat <
			stream.next(); // eat /
			state.tokenize = this.eatTagName(name, true);
			return this.makeLocalTagStyle('extTagBracket', state);
		};
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	inExtTokens(origString: string | false): Tokenizer {
		return (stream, state) => {
			let ret: string;
			if (state.extMode === false) {
				ret = `mw-tag-${state.extName} ${tokens.extTag}`;
				stream.skipToEnd();
			} else {
				ret = `mw-tag-${state.extName} ${state.extMode.token(stream, state.extState as State)}`;
			}
			if (stream.eol()) {
				if (origString !== false) {
					stream.string = origString;
				}
				pop(state);
			}
			return ret;
		};
	}

	/**
	 * Remembers position and status for rollbacking.
	 * It is needed for changing from bold to italic with apostrophes before it, if required.
	 *
	 * @see https://phabricator.wikimedia.org/T108455
	 * @param stream
	 */
	prepareItalicForCorrection(stream: StringStream): void {
		// See Parser::doQuotes() in MediaWiki Core, it works similarly.
		// this.firstSingleLetterWord has maximum priority
		// this.firstMultiLetterWord has medium priority
		// this.firstSpace has low priority
		const end = stream.pos,
			str = stream.string.slice(0, end - 3),
			x1 = str.slice(-1),
			x2 = str.slice(-2, -1);
		// this.firstSingleLetterWord always is undefined here
		if (x1 === ' ') {
			if (this.firstMultiLetterWord || this.firstSpace) {
				return;
			}
			this.firstSpace = end;
		} else if (x2 === ' ') {
			this.firstSingleLetterWord = end;
		} else if (this.firstMultiLetterWord) {
			return;
		} else {
			this.firstMultiLetterWord = end;
		}
		this.mark = end;
	}

	/**
	 * main entry
	 *
	 * @see https://codemirror.net/docs/ref/#language.StreamParser
	 */
	get mediawiki(): StreamParser<State> {
		return {
			name: 'mediawiki',

			startState: () => ({
				tokenize: this.eatWikiText(''),
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
			}),

			copyState,

			token: (stream, state): string => {
				const {readyTokens} = this;
				let {oldToken} = this;
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
						if (this.mark === pos) {
							// rollback
							this.mark = null;
							// add one apostrophe, next token will be italic (two apostrophes)
							stream.string = string.slice(0, pos - 2);
							const s = state.tokenize(stream, state);
							stream.string = string;
							oldToken.pos++;
							this.oldToken = oldToken;
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
					this.oldToken = readyTokens.shift()!;
					stream.pos = pos;
					stream.string = string;
					return this.makeFullStyle(style, state);
				} else if (stream.sol()) {
					// reset bold and italic status in every new line
					state.bold = false;
					state.italic = false;
					state.dt.n = 0;
					this.firstSingleLetterWord = null;
					this.firstMultiLetterWord = null;
					this.firstSpace = null;
				}
				readyTokens.length = 0;
				this.mark = null;
				this.oldToken = {pos: stream.pos, string: stream.string, state: copyState(state), style: ''};
				let style: Style;
				do {
					// get token style
					style = state.tokenize(stream, state);
					if (typeof style === 'string' && style.includes(tokens.templateArgumentName)) {
						for (let i = readyTokens.length - 1; i >= 0; i--) {
							const token = readyTokens[i]!;
							if (cmpNesting(state, token.state)) {
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
							const token = readyTokens[i]!,
								{state: st, style: s} = token;
							if (cmpNesting(state, st)) {
								const local = typeof s === 'string',
									type = !local && s[0].split(' ').find(t => t && !t.endsWith('-ground')),
									isCaption = type === tokens.tableCaption,
									isTh = type === tokens.strong;
								if (isCaption) {
									token.style = `${
										s[0].replace(tokens.tableCaption, '')
									} ${tokens.tableDefinition} mw-html-caption`;
								} else if (isTh) {
									token.style = `${
										s[0].replace(tokens.strong, '')
									} ${tokens.tableDefinition} mw-html-th`;
								} else if (type === undefined) {
									token.style = `${s[0]} ${tokens.tableDefinition} mw-html-td`;
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
					this.mark = null;
				}
				stream.pos = this.oldToken.pos;
				stream.string = this.oldToken.string;
				Object.assign(state, this.oldToken.state);
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

			languageData: {
				commentTokens: {block: {open: '<!--', close: '-->'}} as CommentTokens,
				closeBrackets: {brackets: ['(', '[', '{', '"']} as CloseBracketConfig,
				autocomplete: this.completionSource,
			},
		};
	}

	get 'text/mediawiki'(): StreamParser<State> {
		return this.mediawiki;
	}

	/**
	 * 提供链接建议
	 * @param str 搜索字符串，开头不包含` `，但可能包含`_`
	 * @param ns 命名空间
	 */
	async #linkSuggest(str: string, ns = 0): Promise<{offset: number, options: Completion[]} | undefined> {
		const {config: {linkSuggest}, nsRegex} = this;
		if (typeof linkSuggest !== 'function' || /[|{}<>[\]#]/u.test(str)) {
			return undefined;
		}
		let subpage = false,
			search = str,
			offset = 0;
		/* eslint-disable no-param-reassign */
		if (search.startsWith('/')) {
			ns = 0;
			subpage = true;
		} else {
			search = search.replace(/_/gu, ' ');
			const mt = /^\s*/u.exec(search)!;
			[{length: offset}] = mt;
			search = search.slice(offset);
			if (search.startsWith(':')) {
				const [{length}] = /^:\s*/u.exec(search)!;
				offset += length;
				search = search.slice(length);
				ns = 0;
			}
			if (!search) {
				return undefined;
			}
			const mt2 = nsRegex.exec(search) as [string, string] | null;
			if (mt2) {
				const [{length}, prefix] = mt2;
				offset += length;
				search = `${prefix}:${search.slice(length)}`;
				ns = 1;
			}
		}
		/* eslint-enable no-param-reassign */
		const underscore = str.slice(offset).includes('_');
		return {
			offset,
			options: (await linkSuggest(search, ns, subpage)).map(([label]) => ({
				type: 'text',
				label: underscore ? label.replace(/ /gu, '_') : label,
			})),
		};
	}

	/**
	 * 提供模板参数建议
	 * @param search 搜索字符串
	 * @param page 模板名，可包含`_`、`:`等
	 * @param equal 是否有等号
	 */
	async #paramSuggest(search: string, page: string, equal: string): Promise<{
		offset: number;
		options: Completion[];
	} | undefined> {
		const {config: {paramSuggest}} = this;
		return page && typeof paramSuggest === 'function' && !/[|{}<>[\]]/u.test(page)
			? {
				offset: /^\s*/u.exec(search)![0].length,
				options: (await paramSuggest(page))
					.map(([key, detail]) => ({type: 'variable', label: key + equal, detail} as Completion)),
			}
			: undefined;
	}

	/** 自动补全魔术字和标签名 */
	get completionSource(): CompletionSource {
		return async context => {
			const {state, pos, explicit} = context,
				node = syntaxTree(state).resolve(pos, -1),
				types = new Set(node.name.split('_')),
				isParserFunction = hasTag(types, 'parserFunctionName'),
				{from, to} = node,
				/** 开头不包含` `，但可能包含`_` */ search = state.sliceDoc(from, pos);
			let {prevSibling} = node;
			if (explicit || isParserFunction && search.includes('#')) {
				const validFor = /^[^|{}<>[\]#]*$/u;
				if (isParserFunction || hasTag(types, 'templateName')) {
					const options = search.includes(':') ? [] : [...this.functionSynonyms],
						suggestions = await this.#linkSuggest(search, 10) || {offset: 0, options: []};
					options.push(...suggestions.options);
					return options.length === 0
						? null
						: {
							from: from + suggestions.offset,
							options,
							validFor,
						};
				}
				const isModule = hasTag(types, 'pageName') && hasTag(types, 'parserFunction') || 0;
				if (isModule && search.trim() || hasTag(types, 'linkPageName')) {
					const suggestions = await this.#linkSuggest((isModule ? 'Module:' : '') + search, isModule && 828);
					return suggestions
						? {
							from: from + suggestions.offset - (isModule && 7),
							options: suggestions.options,
							validFor,
						}
						: null;
				}
				const isArgument = hasTag(types, 'templateArgumentName'),
					prevIsDelimiter = prevSibling?.name.includes(tokens.templateDelimiter),
					isDelimiter = hasTag(types, 'templateDelimiter')
					|| hasTag(types, 'templateBracket') && prevIsDelimiter;
				if (
					'templatedata' in this.config.tags
					&& (
						isDelimiter
						|| isArgument && !search.includes('=')
						|| hasTag(types, 'template') && prevIsDelimiter
					)
				) {
					let stack = 1,
						/** 可包含`_`、`:`等 */ page = '';
					while (prevSibling) {
						const {name, from: f, to: t} = prevSibling;
						if (name.includes(tokens.templateBracket)) {
							stack += state.sliceDoc(f, t).includes('{{') ? -1 : 1;
							if (stack === 0) {
								break;
							}
						} else if (stack === 1 && name.includes(tokens.templateName)) {
							page = state.sliceDoc(f, t) + page;
						} else if (page && !name.includes(tokens.comment)) {
							prevSibling = null;
							break;
						}
						({prevSibling} = prevSibling);
					}
					if (prevSibling) {
						const equal = isArgument && state.sliceDoc(pos, to).trim() === '=' ? '' : '=',
							suggestions = await this.#paramSuggest(isDelimiter ? '' : search, page, equal);
						return suggestions && suggestions.options.length > 0
							? {
								from: isDelimiter ? pos : from + suggestions.offset,
								options: suggestions.options,
								validFor: /^[^|{}=]*$/u,
							}
							: null;
					}
				}
			} else if (
				hasTag(types, ['htmlTagAttribute', 'tableDefinition', 'mw-ext-pre', 'mw-ext-gallery', 'mw-ext-poem'])
			) {
				const [, tagName] = /mw-(?:ext|html)-([a-z]+)/u.exec(node.name) as string[] as [string, string],
					mt = context.matchBefore(hasTag(types, 'tableDefinition') ? /[\s|-][a-z]+$/iu : /\s[a-z]+$/iu);
				if (mt) {
					return mt.from >= from && /^[|-]/u.test(mt.text)
						? null
						: {
							from: mt.from + 1,
							options: [
								...tagName === 'meta' || tagName === 'link' ? [] : this.htmlAttrs,
								...this.elementAttrs.get(tagName) || [],
							],
							validFor: /^[a-z]*$/iu,
						};
				}
			} else if (hasTag(types, 'extTagAttribute')) {
				const [, tagName] = /mw-ext-([a-z]+)/u.exec(node.name) as string[] as [string, string],
					mt = context.matchBefore(/\s[a-z]+$/iu);
				return mt && this.extAttrs.has(tagName)
					? {
						from: mt.from + 1,
						options: this.extAttrs.get(tagName)!,
						validFor: /^[a-z]*$/iu,
					}
					: null;
			} else if (!hasTag(types, [
				'comment',
				'templateVariableName',
				'templateName',
				'linkPageName',
				'linkToSection',
				'extLink',
			])) {
				let mt = context.matchBefore(/__(?:(?!__)[\p{L}\d_])*$/u);
				if (mt) {
					return {
						from: mt.from,
						options: this.doubleUnderscore,
						validFor: /^[\p{L}\d]*$/u,
					};
				}
				mt = context.matchBefore(/<\/?[a-z\d]*$/iu);
				const extTags = [...types].filter(t => t.startsWith('mw-tag-')).map(s => s.slice(7));
				if (mt && mt.to - mt.from > 1) {
					const validFor = /^[a-z\d]*$/iu;
					if (mt.text[1] === '/') {
						const mt2 = context.matchBefore(/<[a-z\d]+(?:\s[^<>]*)?>(?:(?!<\/?[a-z]).)*<\/[a-z\d]*$/iu),
							target = /^<([a-z\d]+)/iu.exec(mt2?.text || '')?.[1]!.toLowerCase(),
							extTag = extTags[extTags.length - 1],
							options = [
								...this.htmlTags.filter(({label}) => !this.implicitlyClosedHtmlTags.has(label)),
								...extTag ? [{type: 'type', label: extTag, boost: 50}] : [],
							],
							i = this.permittedHtmlTags.has(target!) && options.findIndex(({label}) => label === target);
						if (i !== false && i !== -1) {
							options.splice(i, 1, {type: 'type', label: target!, boost: 99});
						}
						return {from: mt.from + 2, options, validFor};
					}
					return {
						from: mt.from + 1,
						options: [
							...this.htmlTags,
							...this.extTags.filter(({label}) => !extTags.includes(label)),
						],
						validFor,
					};
				}
				if (types.has('mw-file-text') && prevSibling?.name.includes(tokens.linkDelimiter)) {
					return {
						from: prevSibling.to,
						options: this.imgKeys,
						validFor: /^[^|{}<>[\]$]*$/u,
					};
				} else if (!hasTag(types, ['linkText', 'extLinkText'])) {
					mt = context.matchBefore(/(?:^|[^[])\[[a-z:/]+$/iu);
					if (mt) {
						return {
							from: mt.from + (mt.text[1] === '[' ? 2 : 1),
							options: this.protocols,
							validFor: /^[a-z:/]*$/iu,
						};
					}
				}
			}
			return null;
		};
	}
}

for (const [language, parser] of Object.entries(plugins)) {
	if (language === 'css' || language === 'javascript') {
		Object.defineProperty(MediaWiki.prototype, language, {
			get() {
				return parser;
			},
		});
	}
}

/**
 * Gets a LanguageSupport instance for the MediaWiki mode.
 * @param config Configuration for the MediaWiki mode
 */
export const mediawiki = (config: MwConfig): LanguageSupport => {
	const mode = new MediaWiki(config),
		lang = StreamLanguage.define(mode.mediawiki),
		highlighter = syntaxHighlighting(HighlightStyle.define(mode.getTagStyles()) as Highlighter);
	return new LanguageSupport(lang, highlighter);
};

/**
 * Gets a LanguageSupport instance for the mixed MediaWiki-HTML mode.
 * @param config Configuration for the MediaWiki mode
 */
export const html = (config: MwConfig): LanguageSupport => mediawiki({
	...config,
	tags: {
		...config.tags,
		script: true,
		style: true,
	},
	tagModes: {
		...config.tagModes,
		script: 'javascript',
		style: 'css',
	},
	permittedHtmlTags: [
		'html',
		'base',
		'title',
		'menu',
		'a',
		'area',
		'audio',
		'map',
		'track',
		'video',
		'embed',
		'iframe',
		'object',
		'picture',
		'source',
		'canvas',
		'col',
		'colgroup',
		'tbody',
		'tfoot',
		'thead',
		'button',
		'datalist',
		'fieldset',
		'form',
		'input',
		'label',
		'legend',
		'meter',
		'optgroup',
		'option',
		'output',
		'progress',
		'select',
		'textarea',
		'details',
		'dialog',
		'slot',
		'template',
		'dir',
		'frame',
		'frameset',
		'marquee',
		'param',
		'xmp',
	],
	implicitlyClosedHtmlTags: [
		'area',
		'base',
		'col',
		'embed',
		'frame',
		'input',
		'param',
		'source',
		'track',
	],
});
