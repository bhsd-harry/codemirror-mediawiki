/**
 * @author MusikAnimal, Bhsd and others
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
import {insertCompletionText, pickedCompletion} from '@codemirror/autocomplete';
import {wmf} from '@bhsd/common';
import {isUnderscore} from '@bhsd/cm-util';
import {commonHtmlAttrs, htmlAttrs, extAttrs} from 'wikiparser-node/dist/util/sharable.mjs';
import {MediaWiki} from './token';
import {htmlTags, tokens} from './config';
import {braceStackUpdate} from './fold';
import {EditorView} from '@codemirror/view';
import type {StreamParser, TagStyle} from '@codemirror/language';
import type {
	CloseBracketConfig,
	CompletionSource,
	Completion,
	CompletionResult,
} from '@codemirror/autocomplete';
import type {StyleSpec} from 'style-mod';
import type {MwConfig, TagName} from './token';

export const isWMF = /* @__PURE__ */ (
	() => typeof location === 'object' && new RegExp(String.raw`\.(?:${wmf})\.org$`, 'u').test(location.hostname)
)();

/**
 * 检查首字母大小写并插入正确的自动填充内容
 * @param view
 * @param completion 自动填充内容
 * @param from 起始位置
 * @param to 结束位置
 */
const apply = (view: EditorView, completion: Completion, from: number, to: number): void => {
	let {label} = completion;
	const initial = label.charAt(0).toLowerCase();
	if (view.state.sliceDoc(from, from + 1) === initial) {
		label = initial + label.slice(1);
	}
	view.dispatch({
		...insertCompletionText(view.state, label, from, to),
		annotations: pickedCompletion.of(completion),
	});
};

/**
 * 判断节点是否包含指定类型
 * @param types 节点类型
 * @param names 指定类型
 */
export const hasTag = (types: Set<string>, names: string | string[]): boolean =>
	(Array.isArray(names) ? names : [names]).some(name => types.has(name in tokens ? tokens[name as TagName] : name));

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
		this.nsRegex = new RegExp(String.raw`^(${
			Object.keys(nsid).filter(Boolean).join('|').replace(/_/gu, ' ')
		})\s*:\s*`, 'iu');
		this.functionSynonyms = functionSynonyms.flatMap((obj, i) => Object.keys(obj).map((label): Completion => ({
			type: i ? 'constant' : 'function',
			label,
		})));
		this.doubleUnderscore = doubleUnderscore.flatMap(Object.keys).filter(isUnderscore).map((label): Completion => ({
			type: 'constant',
			label,
		}));
		this.extTags = this.tags.map((label): Completion => ({type: 'type', label}));
		this.htmlTags = htmlTags.filter(tag => !this.tags.includes(tag)).map((label): Completion => ({
			type: 'type',
			label,
		}));
		this.protocols = urlProtocols.split('|').map((label): Completion => ({
			type: 'namespace',
			label: label.replace(/\\\//gu, '/'),
		}));
		this.imgKeys = this.img.map((label): Completion => label.endsWith('$1')
			? {type: 'property', label: label.slice(0, -2), detail: '$1'}
			: {type: 'keyword', label});
		this.htmlAttrs = [
			...[...commonHtmlAttrs].map((label): Completion => ({type: 'property', label})),
			{type: 'variable', label: 'data-', detail: '*'},
			{type: 'namespace', label: 'xmlns:', detail: '*'},
		];
		this.elementAttrs = new Map(Object.entries(htmlAttrs).map(([key, value]) => [
			key,
			[...value].map((label): Completion => ({type: 'property', label})),
		]));
		this.extAttrs = new Map(Object.entries(extAttrs).map(([key, value]) => [
			key,
			[...value].map((label): Completion => ({type: 'property', label})),
		]));
	}

	/**
	 * This defines the actual CSS class assigned to each tag/token.
	 *
	 * @see https://codemirror.net/docs/ref/#language.TagStyle
	 */
	getTagStyles(): TagStyle[] {
		return Object.keys(this.tokenTable).map((className): TagStyle => ({
			tag: this.tokenTable[className]!,
			class: `cm-${className}`,
		}));
	}

	override mediawiki(tags?: string[]): StreamParser<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
		const parser = super.mediawiki(tags);
		parser.languageData = {
			closeBrackets: {brackets: ['(', '[', '{', '"'], before: ')]}>'} satisfies CloseBracketConfig,
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
		const {config: {linkSuggest, nsid}, nsRegex} = this;
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
				ns = nsid[prefix.replace(/ /gu, '_').toLowerCase()] || 1;
				offset += length;
				search = `${ns === -2 ? 'File' : prefix}:${search.slice(length)}`;
			}
		}
		/* eslint-enable no-param-reassign */
		const underscore = str.slice(offset).includes('_');
		return {
			offset,
			options: (await linkSuggest(search, ns, subpage)).map(([label]): Completion => ({
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
		const {config: {paramSuggest}} = this,
			result = await paramSuggest?.(page);
		return result?.length
			? {
				offset: /^\s*/u.exec(search)![0].length,
				options: result.map(([key, detail]) => ({type: 'variable', label: key + equal, detail} as Completion)),
			}
			: undefined;
	}

	/** 自动补全魔术字和标签名 */
	get completionSource(): CompletionSource {
		return async (context): Promise<CompletionResult | null> => {
			const {state, pos, explicit} = context,
				node = syntaxTree(state).resolve(pos, -1),
				types = new Set(node.name.split('_')),
				isParserFunction = hasTag(types, 'parserFunctionName'),
				/** 开头不包含` `，但可能包含`_` */ search = state.sliceDoc(node.from, pos).trimStart(),
				start = pos - search.length;
			let {prevSibling} = node;
			if (explicit || isParserFunction && search.includes('#') || isWMF) {
				const validFor = isWMF ? null : {validFor: /^[^|{}<>[\]#]*$/u};
				if (isParserFunction || hasTag(types, 'templateName')) {
					const options = search.includes(':') ? [] : [...this.functionSynonyms],
						suggestions = await this.#linkSuggest(search, 10) ?? {offset: 0, options: []};
					options.push(...suggestions.options);
					return options.length === 0
						? null
						: {
							from: start + suggestions.offset,
							options,
							...validFor,
						};
				} else if (explicit && hasTag(types, 'templateBracket') && context.matchBefore(/\{\{$/u)) {
					return {
						from: pos,
						options: this.functionSynonyms,
						...validFor,
					};
				}
				const isPage = hasTag(types, 'pageName') && hasTag(types, 'parserFunction') || 0;
				if (isPage && search.trim() || hasTag(types, 'linkPageName')) {
					let prefix = '';
					if (isPage) {
						prefix = this.autocompleteNamespaces[
							[...types].find(t => t.startsWith('mw-function-'))!
								.slice(12) as unknown as keyof typeof this.autocompleteNamespaces
						];
					}
					const suggestions = await this.#linkSuggest(prefix + search);
					if (!suggestions) {
						return null;
					} else if (!isPage) {
						suggestions.options = suggestions.options.map((option): Completion => ({...option, apply}));
					} else if (prefix === 'Module:') {
						suggestions.options = suggestions.options
							.filter(({label}) => !label.endsWith('/doc'));
					}
					return {
						// eslint-disable-next-line unicorn/explicit-length-check
						from: start + suggestions.offset - (isPage && prefix.length),
						options: suggestions.options,
						...validFor,
					};
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
					let stack = -1,
						/** 可包含`_`、`:`等 */ page = '';
					while (prevSibling) {
						const {name, from, to} = prevSibling;
						if (name.includes(tokens.templateBracket)) {
							const [lbrace, rbrace] = braceStackUpdate(state, prevSibling);
							stack += lbrace;
							if (stack >= 0) {
								break;
							}
							stack += rbrace;
						} else if (stack === -1 && name.includes(tokens.templateName)) {
							page = state.sliceDoc(from, to) + page;
						} else if (page && !name.includes(tokens.comment)) {
							prevSibling = null;
							break;
						}
						({prevSibling} = prevSibling);
					}
					if (prevSibling && page) {
						const equal = isArgument && state.sliceDoc(pos, node.to).trim() === '=' ? '' : '=',
							suggestions = await this.#paramSuggest(isDelimiter ? '' : search, page, equal);
						if (suggestions && suggestions.options.length > 0) {
							return {
								from: isDelimiter ? pos : start + suggestions.offset,
								options: suggestions.options,
								validFor: /^[^|{}=]*$/u,
							};
						}
					}
				}
			}
			const isTagName = hasTag(types, ['htmlTagName', 'extTagName']),
				explicitMatch = explicit && context.matchBefore(/\s$/u),
				validForAttr = /^[a-z]*$/iu;
			if (
				isTagName && explicitMatch
				|| hasTag(types, ['htmlTagAttribute', 'extTagAttribute', 'tableDefinition'])
			) {
				const tagName = isTagName ? search.trim() : /mw-(?:ext|html)-([a-z]+)/u.exec(node.name)![1]!,
					mt = explicitMatch || context.matchBefore(
						hasTag(types, 'tableDefinition') ? /[\s|-][a-z]+$/iu : /\s[a-z]+$/iu,
					);
				return mt && (mt.from < start || /^\s/u.test(mt.text))
					? {
						from: mt.from + 1,
						options: [
							...tagName === 'meta' || tagName === 'link'
							|| tagName in this.config.tags && !this.elementAttrs.has(tagName)
								? []
								: this.htmlAttrs,
							...this.elementAttrs.get(tagName) ?? [],
							...this.extAttrs.get(tagName) ?? [],
						],
						validFor: validForAttr,
					}
					: null;
			} else if (explicit && hasTag(types, ['tableTd', 'tableTh', 'tableCaption'])) {
				const [, tagName] = /mw-table-([a-z]+)/u.exec(node.name) as string[] as [string, string],
					mt = context.matchBefore(/[\s|!+][a-z]*$/iu);
				if (mt && (mt.from < start || /^\s/u.test(mt.text))) {
					return {
						from: mt.from + 1,
						options: [
							...this.htmlAttrs,
							...this.elementAttrs.get(tagName) ?? [],
						],
						validFor: validForAttr,
					};
				}
			} else if (hasTag(types, [
				'comment',
				'templateVariableName',
				'templateName',
				'linkPageName',
				'linkToSection',
				'extLink',
			])) {
				return null;
			}
			let mt = context.matchBefore(/__(?:(?!__)[\p{L}\p{N}_])*$/u);
			if (mt) {
				return {
					from: mt.from,
					options: this.doubleUnderscore,
					validFor: /^[\p{L}\p{N}]*$/u,
				};
			}
			mt = context.matchBefore(/<\/?[a-z\d]*$/iu);
			const extTags = [...types].filter(t => t.startsWith('mw-tag-'))
				.map(s => s.slice(7));
			if (mt && (explicit || mt.to - mt.from > 1)) {
				const validFor = /^[a-z\d]*$/iu;
				if (mt.text[1] === '/') {
					const mt2 = context
							.matchBefore(/<[a-z\d]+(?:\s[^<>]*)?>(?:(?!<\/?[a-z]).)*<\/[a-z\d]*$/iu),
						target = /^<([a-z\d]+)/iu.exec(mt2?.text ?? '')?.[1]!.toLowerCase(),
						extTag = extTags[extTags.length - 1],
						closed = /^\s*>/u.test(state.sliceDoc(pos)),
						options = [
							...this.htmlTags.filter(({label}) => !this.voidHtmlTags.has(label)),
							...extTag ? [{type: 'type', label: extTag, boost: 50}] : [],
						],
						i = this.permittedHtmlTags.has(target) && options.findIndex(({label}) => label === target);
					if (i !== false && i !== -1) {
						options.splice(i, 1, {type: 'type', label: target!, boost: 99});
					}
					return {
						from: mt.from + 2,
						options: closed
							? options
							: options.map((option): Completion => ({...option, apply: `${option.label}>`})),
						validFor,
					};
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
			const isDelimiter = explicit && hasTag(types, 'fileDelimiter');
			if (
				isDelimiter
				|| hasTag(types, 'fileText')
				&& prevSibling?.name.includes(tokens.fileDelimiter)
				&& !search.includes('[')
			) {
				const equal = state.sliceDoc(pos, pos + 1) === '=';
				return {
					from: isDelimiter ? pos : prevSibling!.to,
					options: equal
						? this.imgKeys.map((option): Completion => ({
							...option,
							apply: option.label.replace(/=$/u, ''),
						}))
						: this.imgKeys,
					validFor: /^[^|{}<>[\]$]*$/u,
				};
			} else if (!hasTag(types, ['linkText', 'extLinkText'])) {
				mt = context.matchBefore(/(?:^|[^[])\[[a-z:/]*$/iu);
				if (mt && (explicit || !mt.text.endsWith('['))) {
					return {
						from: mt.from + (mt.text[1] === '[' ? 2 : 1),
						options: this.protocols,
						validFor: /^[a-z:/]*$/iu,
					};
				}
			}
			return null;
		};
	}
}

const getSelector = (cls: string[], prefix: string | string[] = ''): string => typeof prefix === 'string'
	? cls.map(c => `.cm-mw-${prefix}${c}`).join()
	: prefix.map(p => getSelector(cls, p)).join();

const getGround = (type: string, ground?: number): string => ground ? `${type}${ground === 1 ? '' : ground}-` : '';

const getGrounds = (
	grounds: [number?, number?, number?][],
	r: number,
	g: number,
	b: number,
	a: number,
): Record<string, StyleSpec> => ({
	[grounds.map(
		([template, ext, link]) => `.cm-mw-${
			getGround('template', template)
		}${
			getGround('exttag', ext)
		}${
			getGround('link', link)
		}ground`,
	).join()]: {
		backgroundColor: `rgb(${r},${g},${b},${a})`,
	},
});

/**
 * @author pastakhov and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */
const theme = /* @__PURE__ */ EditorView.theme({
	[getSelector(['', '~*'], 'section--1')]: {
		fontSize: '1.8em',
		lineHeight: '1.2em',
	},
	[getSelector(['', '~*'], 'section--2')]: {
		fontSize: '1.5em',
		lineHeight: '1.2em',
	},
	[getSelector(['3~*', '4~*', '5~*', '6~*'], 'section--')]: {
		fontWeight: 'bold',
	},
	[`${
		getSelector(['section-header', 'template', 'parserfunction', 'file-delimiter', 'magic-link'])
	},${
		getSelector(['pagename', 'bracket', 'delimiter'], 'link-')
	},${
		getSelector(['extlink'], ['', 'free-'])
	},${
		getSelector(['bracket', 'attribute'], ['exttag-', 'htmltag-'])
	},${
		getSelector(['delimiter2', 'definition'], 'table-')
	}`]: {
		fontWeight: 'normal',
	},
	[`${
		getSelector(['redirect', 'list', 'free-extlink-protocol', 'strong'])
	},${
		getSelector(['protocol', 'bracket'], 'extlink-')
	},${
		getSelector(['tag-name'], ['ext', 'html'])
	},${
		getSelector(['bracket', 'delimiter', 'th', 'caption'], 'table-')
	},${
		getSelector(['bracket', 'delimiter'], 'convert-')
	}`]: {
		fontWeight: 'bold',
	},
	[`${
		getSelector(['pagename', 'link-tosection', 'magic-link'])
	},${
		getSelector(['extlink', 'extlink-protocol'], ['', 'free-'])
	}`]: {
		textDecoration: 'underline',
	},
	'.cm-mw-em': {
		fontStyle: 'italic',
	},
	[getSelector(['section-header', 'redirect', 'list', 'apostrophes'])]: {
		color: 'var(--cm-hr)',
	},
	'.cm-mw-error': {
		color: 'var(--cm-error)',
	},
	'.cm-mw-skipformatting': {
		backgroundColor: 'var(--cm-sp)',
	},
	[getSelector(['double-underscore', 'signature', 'hr'])]: {
		color: 'var(--cm-hr)',
		fontWeight: 'bold',
		backgroundColor: 'var(--cm-hr-bg)',
	},
	[getSelector(['comment', 'ignored'])]: {
		color: 'var(--cm-comment)',
		fontWeight: 'normal',
	},
	[getSelector(['name', 'delimiter', 'bracket'], 'template-')]: {
		color: 'var(--cm-tpl)',
		fontWeight: 'bold',
	},
	'.cm-mw-template-argument-name': {
		color: 'var(--cm-arg)',
		fontWeight: 'normal',
	},
	'.cm-mw-templatevariable': {
		color: 'var(--cm-var)',
		fontWeight: 'normal',
	},
	[getSelector(['name', 'bracket', 'delimiter'], 'templatevariable-')]: {
		color: 'var(--cm-var-name)',
		fontWeight: 'bold',
	},
	[getSelector(['name', 'bracket', 'delimiter'], 'parserfunction-')]: {
		color: 'var(--cm-func)',
		fontWeight: 'bold',
	},
	[`${
		getSelector(['pagename', 'bracket', 'delimiter'], 'link-')
	},${
		getSelector(['file-delimiter', 'magic-link'])
	},${
		getSelector(['', '-protocol', '-bracket'], 'extlink')
	},${
		getSelector(['', '-protocol'], 'free-extlink')
	}`]: {
		color: 'var(--cm-link)',
	},
	[getSelector(['image-parameter', 'link-tosection'])]: {
		color: 'var(--cm-sect)',
		fontWeight: 'normal',
	},
	[getSelector(['name', 'bracket', 'attribute'], ['exttag-', 'htmltag-'])]: {
		color: 'var(--cm-tag)',
	},
	[getSelector(['tag-attribute-value'], ['ext', 'html'])]: {
		color: 'var(--cm-attr)',
		fontWeight: 'normal',
	},
	[getSelector(['bracket', 'delimiter', 'delimiter2', 'definition'], 'table-')]: {
		color: 'var(--cm-table)',
	},
	'.cm-mw-table-definition-value': {
		color: 'var(--cm-table-attr)',
		fontWeight: 'normal',
	},
	[getSelector(['bracket', 'delimiter', 'flag', 'lang'], 'convert-')]: {
		color: 'var(--cm-convert)',
	},
	'.cm-mw-entity': {
		color: 'var(--cm-entity)',
	},
	'.cm-mw-exttag': {
		backgroundColor: 'rgb(119,0,170,.04)',
	},
	/* eslint-disable no-sparse-arrays */
	...getGrounds([[1]], 170, 17, 17, 0.04),
	...getGrounds([[2]], 170, 17, 17, 0.08),
	...getGrounds([[3]], 170, 17, 17, 0.12),
	...getGrounds([[1, 1], [, 1]], 119, 0, 170, 0.04),
	...getGrounds([[1, 2], [, 2]], 119, 0, 170, 0.08),
	...getGrounds([[1, 3], [, 3]], 119, 0, 170, 0.12),
	...getGrounds([[1,, 1], [, 1, 1], [,, 1]], 34, 17, 153, 0.04),
	...getGrounds([[1, 1, 1], [, 2, 1]], 77, 9, 162, 0.08),
	...getGrounds([[1, 2, 1], [, 3, 1]], 91, 6, 164, 0.12),
	...getGrounds([[1, 3, 1]], 98, 4, 166, 0.16),
	...getGrounds([[2, 1]], 145, 9, 94, 0.08),
	...getGrounds([[2, 2]], 136, 6, 119, 0.12),
	...getGrounds([[2, 3]], 132, 4, 132, 0.16),
	...getGrounds([[2,, 1]], 102, 17, 85, 0.08),
	...getGrounds([[2, 1, 1]], 108, 11, 113, 0.12),
	...getGrounds([[2, 2, 1]], 111, 9, 128, 0.16),
	...getGrounds([[2, 3, 1]], 112, 7, 136, 0.2),
	...getGrounds([[3, 1]], 153, 11, 68, 0.12),
	...getGrounds([[3, 2]], 145, 9, 94, 0.16),
	...getGrounds([[3, 3]], 139, 7, 109, 0.2),
	...getGrounds([[3,, 1]], 125, 17, 62, 0.12),
	...getGrounds([[3, 1, 1]], 123, 13, 89, 0.16),
	...getGrounds([[3, 2, 1]], 122, 10, 105, 0.2),
	...getGrounds([[3, 3, 1]], 122, 9, 116, 0.24),
	/* eslint-enable no-sparse-arrays */
	[getSelector(['pre', 'nowiki'], 'tag-')]: {
		backgroundColor: 'rgb(0,0,0,.04)',
	},
	'.cm-bidi-isolate, &[dir="rtl"] .cm-mw-template-name': {
		unicodeBidi: 'isolate',
	},
	'.cm-bidi-ltr': {
		direction: 'ltr',
		display: 'inline-block',
	},
});

/**
 * Gets a LanguageSupport instance for the MediaWiki mode.
 * @param config Configuration for the MediaWiki mode
 */
export const mediawiki = (config: MwConfig): LanguageSupport => {
	const mode = new FullMediaWiki(config),
		lang = StreamLanguage.define(mode.mediawiki()),
		highlighter = syntaxHighlighting(HighlightStyle.define(mode.getTagStyles()));
	return new LanguageSupport(lang, [highlighter, theme]);
};
