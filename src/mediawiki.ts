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
import {MediaWiki} from './token';
import modeConfig from './config';
import * as plugins from './plugins';
import type {StreamParser, TagStyle} from '@codemirror/language';
import type {
	CloseBracketConfig,
	CompletionSource,
	Completion,
} from '@codemirror/autocomplete';
import type {CommentTokens} from '@codemirror/commands';
import type {Highlighter} from '@lezer/highlight';
import type {MwConfig, TagName} from './token';

const {htmlTags, tokens, htmlAttrs, elementAttrs, extAttrs} = modeConfig;

/**
 * 判断节点是否包含指定类型
 * @param types 节点类型
 * @param names 指定类型
 */
const hasTag = (types: Set<string>, names: string | string[]): boolean => (Array.isArray(names) ? names : [names])
	.some(name => types.has(name in tokens ? tokens[name as TagName] : name));

export class FullMediaWiki extends MediaWiki {
	declare readonly nsRegex;
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
		super(config);
		const {
			urlProtocols,
			nsid,
			functionSynonyms,
			doubleUnderscore,
		} = config;
		this.nsRegex = new RegExp(`^(${
			Object.keys(nsid).filter(Boolean).join('|').replace(/_/gu, ' ')
		})\\s*:\\s*`, 'iu');
		this.functionSynonyms = functionSynonyms.flatMap((obj, i) => Object.keys(obj).map(label => ({
			type: i ? 'constant' : 'function',
			label,
		})));
		this.doubleUnderscore = doubleUnderscore.flatMap(Object.keys).map(label => ({
			type: 'constant',
			label,
		}));
		this.extTags = this.tags.map(label => ({type: 'type', label}));
		this.htmlTags = htmlTags.filter(tag => !this.tags.includes(tag)).map(label => ({
			type: 'type',
			label,
		}));
		this.protocols = urlProtocols.split('|').map(label => ({
			type: 'namespace',
			label: label.replace(/\\\//gu, '/'),
		}));
		this.imgKeys = this.img.map(label => label.endsWith('$1')
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

	override mediawiki(tags?: string[]): StreamParser<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
		const parser = super.mediawiki(tags);
		parser.languageData = {
			commentTokens: {block: {open: '<!--', close: '-->'}} as CommentTokens,
			closeBrackets: {brackets: ['(', '[', '{', '"']} as CloseBracketConfig,
			autocomplete: this.completionSource,
		};
		return parser;
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
					this.tags.includes('templatedata')
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
			}
			if (
				hasTag(types, ['htmlTagAttribute', 'tableDefinition', 'mw-ext-pre', 'mw-ext-gallery', 'mw-ext-poem'])
				|| explicit && hasTag(types, ['tableTd', 'tableTh', 'tableCaption'])
			) {
				let re = hasTag(types, ['htmlTagAttribute', 'extTagAttribute']) ? /\s[a-z]+$/iu : /[\s|-][a-z]+$/iu;
				if (explicit) {
					re = /[\s|!+-][a-z]+$/iu;
				}
				const [, tagName] = /mw-(?:ext|html|table)-([a-z]+)/u.exec(node.name) as string[] as [string, string],
					mt = context.matchBefore(re);
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
				if (
					hasTag(types, 'fileText')
					&& prevSibling?.name.includes(tokens.linkDelimiter)
					&& !search.includes('[')
				) {
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
		Object.defineProperty(FullMediaWiki.prototype, language, {
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
	const mode = new FullMediaWiki(config),
		lang = StreamLanguage.define(mode.mediawiki()),
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
