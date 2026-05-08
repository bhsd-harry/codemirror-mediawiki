/**
 * @author MusikAnimal, Bhsd and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {
	StreamLanguage,
	syntaxTree,
	LanguageSupport,
} from '@codemirror/language';
import {EditorView} from '@codemirror/view';
import {insertCompletionText, pickedCompletion} from '@codemirror/autocomplete';
import elt from 'crelt';
import {numLeadingSpaces} from '@bhsd/common';
import {isUnderscore} from '@bhsd/cm-util';
import {commonHtmlAttrs, htmlAttrs, extAttrs} from 'wikiparser-node/dist/util/sharable.mjs';
import {htmlTags, tokens} from './config.js';
import {
	extCompletion,
	isWMF,
	mwPrefix,
} from './constants.js';
import {lightHighlightStyle} from './theme.js';
import {MediaWiki} from './token.js';
import {
	getCompletions,
	getExtTags,
	findTemplateName,
	getSubpageLevel,
	useUnderscore,
	getHighlightExtension,
	loadMarked,
} from './util.js';
import {hoverStyle} from './hover.js';
import type {
	TagStyle,
} from '@codemirror/language';
import type {
	CompletionSource,
	Completion,
	CompletionResult,
	CompletionInfo,
} from '@codemirror/autocomplete';
import type {StyleSpec} from 'style-mod';
import type {Marked} from 'marked';
import type {
	MwConfig,
	CompletionSectionName,
} from './token';
import type {TagName} from './config';
import type {CodeMirror6} from './codemirror';

declare const marked: Marked;

const ranks: Record<CompletionSectionName, number> = {Required: 1, Suggested: 2, Optional: 3, Deprecated: 4};

/**
 * 是否是普通维基链接
 * @param name 节点名称
 */
export const isWikiLink = (name: string): boolean => /mw-[\w-]*link-ground/u.test(name);

/**
 * 插入displayLabel（如果有）而不是label
 * @param view
 * @param completion 自动填充内容
 * @param from 起始位置
 * @param to 结束位置
 * @test
 */
export const applyDisplayLabel = (view: EditorView, completion: Completion, from: number, to: number): void => {
	const {label, displayLabel = label} = completion;
	view.dispatch({
		...insertCompletionText(view.state, displayLabel, from, to),
		annotations: pickedCompletion.of(completion),
	});
};

/**
 * 检查首字母大小写并插入正确的自动填充内容
 * @param view
 * @param completion 自动填充内容
 * @param from 起始位置
 * @param to 结束位置
 * @test
 */
export const apply = (view: EditorView, completion: Completion, from: number, to: number): void => {
	const {label, info} = completion;
	let {displayLabel = label} = completion,
		selection;
	const {state} = view,
		after = state.sliceDoc(to);
	if (!/^\s*\|/u.test(after)) {
		const initial = label.charAt(0).toLowerCase(),
			anchor = from + displayLabel.length + 1;
		selection = {anchor, head: anchor + (info ?? label).length};
		displayLabel += `|${
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			info as string ?? (state.sliceDoc(from, from + 1) === initial ? initial + label.slice(1) : label)
		}${/^\s*\]\]/u.test(after) ? '' : ']]'}`;
	}
	view.dispatch({
		...insertCompletionText(state, displayLabel, from, to),
		annotations: pickedCompletion.of(completion),
		selection,
	});
};

/**
 * 判断节点是否包含指定类型
 * @param types 节点类型
 * @param names 指定类型
 * @test
 */
export const hasTag = (types: Set<string> | string, names: TagName | TagName[]): boolean => {
	if (typeof types === 'string') {
		types = new Set(types.split('_'));
	}
	return (Array.isArray(names) ? names : [names]).some(name => types.has(name in tokens ? tokens[name] : name));
};

/**
 * `info` method of `Completion`
 * @ignore
 */
const getInfo = async ({md}: Completion & {md?: string}): Promise<CompletionInfo> => {
	await loadMarked();
	const dom = elt('div');
	dom.innerHTML = await marked.parseInline(md!);
	return {dom};
};

const updateItems = (
	completions: Completion[],
	data: {aliases: string[], description?: string}[],
	toName: (label: string) => string,
): void => {
	for (const completion of completions) {
		const name = toName(completion.label),
			md = data.find(({aliases}) => aliases.includes(name))?.description;
		if (md) {
			Object.assign(completion, {
				info: getInfo,
				md: md.split('\n', 1)[0],
			});
		}
	}
};

/** @test */
export class FullMediaWiki extends MediaWiki {
	declare readonly cm: CodeMirror6 | undefined;
	declare readonly templatedata: boolean;
	declare readonly nsRegex;
	declare readonly extTags;
	declare readonly htmlTags;
	declare readonly protocols;
	declare readonly imgKeys;

	readonly htmlAttrs = [
		...getCompletions([...commonHtmlAttrs], 'property'),
		{type: 'variable', label: 'data-', detail: '*'},
		{type: 'namespace', label: 'xmlns:', detail: '*'},
	];

	readonly elementAttrs = new Map(Object.entries(htmlAttrs).map(([key, value]) => [
		key,
		getCompletions([...value], 'property'),
	]));

	readonly extAttrs = new Map(Object.entries(extAttrs).map(([key, value]) => [
		key,
		getCompletions([...value], 'property'),
	]));

	#doubleUnderscore;
	#functionSynonyms;
	#usingLSP = false;

	constructor(
		config: MwConfig,
		cm?: CodeMirror6,
		templatedata = false,
	) {
		super(config);
		const {
			urlProtocols,
			nsid,
			functionSynonyms,
			doubleUnderscore,
		} = config;
		this.cm = cm;
		this.templatedata = templatedata;
		this.nsRegex = new RegExp(String.raw`^(${
			Object.keys(nsid).filter(ns => ns !== '').join('|')
				.replaceAll('_', ' ')
		})\s*:\s*`, 'iu');
		this.extTags = getCompletions(this.tags, 'type');
		this.htmlTags = getCompletions(htmlTags.filter(tag => !this.tags.includes(tag)), 'type');
		this.protocols = urlProtocols.split('|').map((label): Completion => ({
			type: 'namespace',
			label: label.replaceAll(String.raw`\/`, '/'),
		}));
		this.imgKeys = this.img.map((label): Completion => label.endsWith('$1')
			? {type: 'property', label: label.slice(0, -2), detail: '$1'}
			: {type: 'keyword', label});
		this.#doubleUnderscore = getCompletions(
			doubleUnderscore.flatMap(Object.keys).filter(isUnderscore),
			'constant',
		);
		this.#functionSynonyms = functionSynonyms.flatMap((obj, i) => Object.keys(obj).map((label): Completion => ({
			type: i ? 'constant' : 'function',
			label,
		})));
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

	/**
	 * 提供链接建议
	 * @param str 搜索字符串，开头不包含` `，但可能包含`_`
	 * @param namespace 命名空间
	 * @param type 命名空间符合预设值时的图标类型
	 * @param contentmodel 内容模型
	 */
	async #linkSuggest(str: string, namespace: number, type?: string, contentmodel?: string): Promise<
		{offset: number, options: Completion[]} | undefined
	> {
		const {config: {linkSuggest, nsid}, nsRegex} = this;
		if (typeof linkSuggest !== 'function' || /[|{}<>[\]#]/u.test(str)) {
			return undefined;
		}
		let subpage = false,
			search = str,
			ns = namespace,
			offset: number;
		if (/^(?:\.\.)?\//u.test(search)) {
			ns = 0;
			subpage = true;
			const level = getSubpageLevel(search);
			offset = level && level - 1;
		} else {
			search = search.replaceAll('_', ' ');
			offset = numLeadingSpaces(search);
			search = search.slice(offset);
			if (search.startsWith(':')) {
				const i = numLeadingSpaces(search.slice(1)) + 1;
				offset += i;
				search = search.slice(i);
				ns = 0;
			}
			if (!search) {
				return undefined;
			}
			const mt2 = nsRegex.exec(search) as [string, string] | null;
			if (mt2) {
				const [{length}, prefix] = mt2;
				ns = nsid[prefix.replaceAll(' ', '_').toLowerCase()] || 1;
				offset += length;
				search = `${ns === -2 ? 'File' : prefix}:${search.slice(length)}`;
			}
		}
		const underscore = str.slice(offset).includes('_');
		return {
			offset,
			options: (await linkSuggest(search, subpage, ns, contentmodel))
				.flatMap(([label, pageNs, redirect = label]): Completion | Completion[] => {
					if (Array.isArray(redirect)) {
						const normalized = useUnderscore(label, underscore);
						return subpage
							? {
								// `../`开头的子页面
								type: 'text',
								label: normalized,
								info: useUnderscore(redirect[0], underscore),
							}
							: {
								// 位于不同命名空间的重定向
								type: 'text',
								label: normalized,
								detail: `↳ ${redirect[0]}`,
							};
					}
					const normalized = useUnderscore(redirect, underscore);
					return redirect === label
						? {
							type: pageNs === namespace && type || 'text',
							label: normalized,
						}
						: [
							{
								type: pageNs === namespace && type || 'text',
								label: normalized,
								displayLabel: label,
							},
							{
								type: 'redirect',
								label: normalized,
							},
						];
				}),
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
		const {paramSuggest} = this.config,
			result = await paramSuggest?.(page);
		return result?.length
			? {
				offset: numLeadingSpaces(search),
				options: result.flatMap(([keys, detail, info, name]) => keys.map((key): Completion => ({
					type: 'variable',
					label: key + equal,
					section: {name, rank: ranks[name]},
					...detail && {detail},
					...info && {info},
				}))),
			}
			: undefined;
	}

	/** 更新魔术字的描述信息 */
	#updateCompletion(): void {
		if (!this.#usingLSP && this.cm?.lsp?.data) {
			this.#usingLSP = true;
			const {
				config: {doubleUnderscore, functionSynonyms},
				cm: {lsp: {data: {behaviorSwitches, parserFunctions}}},
			} = this;
			updateItems(
				this.#doubleUnderscore,
				behaviorSwitches,
				label => (doubleUnderscore[0][label] || doubleUnderscore[1][label] || label.slice(2, -2))
					.toLowerCase(),
			);
			updateItems(
				this.#functionSynonyms,
				parserFunctions,
				label => {
					const name = functionSynonyms[0][label] || functionSynonyms[1][label] || label;
					return label.startsWith('#') && !name.startsWith('#') ? `#${name}` : name;
				},
			);
		}
	}

	get doubleUnderscore(): Completion[] {
		this.#updateCompletion();
		return this.#doubleUnderscore;
	}

	get functionSynonyms(): Completion[] {
		this.#updateCompletion();
		return this.#functionSynonyms;
	}

	/** 自动补全魔术字和标签名 */
	get completionSource(): CompletionSource {
		return async (context): Promise<CompletionResult | null> => {
			const {state, pos, explicit} = context,
				node = syntaxTree(state).resolveInner(pos, -1),
				{
					name: n,
					prevSibling,
					from: f,
					to: t,
				} = node,
				types = new Set(n.split('_')),
				isParserFunction = hasTag(types, 'parserFunctionName'),
				/** 开头不包含` `，但可能包含`_` */ search = state.sliceDoc(f, pos).trimStart(),
				start = pos - search.length;
			// 需要opensearch API的建议，只在显式触发时或WMF网站上提供
			if (explicit || isWMF || isParserFunction && search.includes('#')) {
				const obj = isWMF
					? null
					: {
						validFor: /^[^|{}<>[\]#]*$/u,
					};
				// 模板名
				if (isParserFunction || hasTag(types, 'templateName')) {
					const options = search.includes(':') ? [] : [...this.functionSynonyms],
						suggestions = await this.#linkSuggest(search, 10, 'type')
							?? {offset: 0, options: []};
					options.push(
						...suggestions.options.map((option): Completion => ({...option, apply: applyDisplayLabel})),
					);
					return options.length === 0
						? null
						: {
							from: start + suggestions.offset,
							options,
							...obj,
						};
				} else if (explicit && hasTag(types, 'templateBracket') && context.matchBefore(/\{\{$/u)) {
					return {
						from: pos,
						options: this.functionSynonyms,
						...obj,
					};
				}
				// 页面名
				const isPage = hasTag(types, 'pageName'),
					isPageFunc = isPage && hasTag(types, 'parserFunction') || 0,
					isTemplateStyles = isPage && hasTag(types, 'extTagAttributeValue');
				if (isPageFunc && search.trim() || isTemplateStyles || hasTag(types, 'linkPageName')) {
					if (!this.config.linkSuggest) {
						return null;
					}
					const isLink = isWikiLink(n);
					let prefix = '',
						ns = 0,
						contentmodel: string | undefined;
					if (isPageFunc) {
						ns = Number(
							[...types].find(type => type.startsWith('mw-function-'))!.slice(12),
						);
						prefix = this.autocompleteNamespaces[ns as keyof typeof this.autocompleteNamespaces];
						if (prefix === 'Module:') {
							contentmodel = 'Scribunto';
						}
					} else if (isTemplateStyles) {
						ns = this.config.templateStylesDefaultNamespace ?? 10;
						contentmodel = 'sanitized-css';
					} else if (hasTag(types, 'mw-tag-gallery' as TagName) && !isLink) {
						ns = 6;
					}
					const suggestions = await this.#linkSuggest(prefix + search, ns, undefined, contentmodel);
					if (!suggestions) {
						return null;
					} else if (!isPageFunc && !isTemplateStyles && isLink) {
						suggestions.options = suggestions.options.map((option): Completion => ({...option, apply}));
					} else {
						suggestions.options = suggestions.options
							.map((option): Completion => ({...option, apply: applyDisplayLabel}));
					}
					return {
						// eslint-disable-next-line unicorn/explicit-length-check
						from: start + suggestions.offset - (isPageFunc && prefix.length),
						options: suggestions.options,
						...isWMF && {filter: false},
						...obj,
					};
				}
			}
			// 需要TemplateData API的建议，只在显式触发时提供
			if (
				this.config.paramSuggest
				&& (explicit || this.templatedata)
				&& this.tags.includes('templatedata')
			) {
				const isArgument = hasTag(types, 'templateArgumentName'),
					prevIsDelimiter = prevSibling?.name.includes(tokens.templateDelimiter),
					isDelimiter = hasTag(types, 'templateDelimiter')
						|| hasTag(types, 'templateBracket') && prevIsDelimiter;
				if (
					isDelimiter
					|| isArgument && !search.includes('=')
					|| hasTag(types, 'template') && prevIsDelimiter
				) {
					const [page] = findTemplateName(state, node);
					if (page) {
						const equal = isArgument && state.sliceDoc(pos, t).trim() === '=' ? '' : '=',
							suggestions = await this.#paramSuggest(isDelimiter ? '' : search, page, equal);
						if (suggestions?.options.length) {
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
				const tagName = isTagName ? search.trim() : /mw-(?:ext|html)-([a-z]+)/u.exec(n)![1]!,
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
				const [, tagName] = /mw-table-([a-z]+)/u.exec(n) as string[] as [string, string],
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
				'parserFunctionName',
				'linkPageName',
				'linkToSection',
				'extLink',
			])) {
				// 不可能是状态开关、标签、协议或图片参数名
				return null;
			} else if (
				'math' in extCompletion
				&& hasTag(types, ['mw-tag-math', 'mw-tag-chem', 'mw-tag-ce'] as string[] as TagName[])
				&& (types.size === 1 || types.has('keyword') || types.has('invalid'))
			) {
				const mt = context.matchBefore(/\\[a-z]*$/iu);
				return mt && {
					from: mt.from,
					options: extCompletion['math'],
					validFor: /^[a-z]*$/iu,
				};
			} else if (
				'score' in extCompletion
				&& hasTag(types, 'mw-tag-score' as TagName)
				&& (types.size === 1 || types.has('keyword'))
			) {
				const mt = context.matchBefore(/\\[-a-z]*$/iu);
				return mt && {
					from: mt.from,
					options: extCompletion['score'],
					validFor: /^[-a-z]*$/iu,
				};
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
			const extTags = getExtTags([...types]);
			if (mt && (explicit || mt.to - mt.from > 1)) {
				const validFor = /^[a-z\d]*$/iu;
				if (mt.text[1] === '/') {
					const mt2 = context
							.matchBefore(/<[a-z\d]+(?:\s[^<>]*)?>(?:(?!<\/?[a-z]).)*<\/[a-z\d]*$/iu),
						target = /^<([a-z\d]+)/iu.exec(mt2?.text ?? '')?.[1]!.toLowerCase(),
						extTag = extTags.at(-1),
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
	? cls.map(c => `.${mwPrefix}${prefix}${c}`).join()
	: prefix.map(p => getSelector(cls, p)).join();

const getGround = (type: 'link' | 'ext' | 'template', ground?: number): string =>
	ground ? `${type}${ground === 1 ? '' : ground}-` : '';

const getGrounds = (
	grounds: [number?, number?, number?][],
	r: number,
	g: number,
	b: number,
	a: number,
): Record<string, StyleSpec> => ({
	[grounds.map(
		([template, ext, link]) => `.${mwPrefix}${
			getGround('template', template)
		}${
			getGround('ext', ext)
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
const wikiTheme = /* @__PURE__ */ EditorView.theme({
	[`.${mwPrefix}section--1`]: {
		fontSize: '1.8em',
		lineHeight: '1.2em',
	},
	[`.${mwPrefix}section--2`]: {
		fontSize: '1.5em',
		lineHeight: '1.2em',
	},
	[getSelector(['3', '4', '5', '6'], 'section--')]: {
		fontWeight: 'bold',
	},
	[`${
		getSelector(['section-header', 'file-delimiter', 'magic-link', 'templatevariable'])
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
	[`.${mwPrefix}em`]: {
		fontStyle: 'italic',
	},
	// 模板和解析器函数的参数不加粗不斜体
	[getSelector(['template', 'parserfunction'])]: {
		fontWeight: 'normal',
		fontStyle: 'normal',
	},
	[`${
		getSelector(['pagename', 'link-tosection', 'magic-link'])
	},${
		getSelector(['extlink', 'extlink-protocol'], ['', 'free-'])
	}`]: {
		textDecoration: 'underline',
	},
	[getSelector(['section-header', 'redirect', 'list', 'apostrophes'])]: {
		color: 'var(--cm-hr)',
	},
	[`.${mwPrefix}error`]: {
		color: 'var(--cm-error)',
	},
	[`.${mwPrefix}skipformatting`]: {
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
	[getSelector(['-argument-name'], ['template', 'parserfunction'])]: {
		color: 'var(--cm-arg)',
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
	[`.${mwPrefix}table-definition-value`]: {
		color: 'var(--cm-table-attr)',
		fontWeight: 'normal',
	},
	[getSelector(['bracket', 'delimiter', 'flag', 'lang'], 'convert-')]: {
		color: 'var(--cm-convert)',
	},
	[`.${mwPrefix}entity`]: {
		color: 'var(--cm-entity)',
	},
	[`.${mwPrefix}exttag,.${mwPrefix}tag-score-scheme`]: {
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
	[`.${mwPrefix}tag-ref`]: {
		backgroundColor: 'var(--cm-ref)',
	},
	'.cm-completionIcon-redirect:after': {
		content: '"⬑"',
		display: 'inline-block',
		transform: 'scaleY(2)',
	},
	...hoverStyle,
});

/**
 * Get a LanguageSupport instance for the MediaWiki mode.
 * @param config Configuration for the MediaWiki mode
 * @param cm CodeMirror6 instance
 * @param templatedata Whether to enable template parameter autocompletion
 */
export const mediawikiBase = (
	config: MwConfig,
	cm?: CodeMirror6,
	templatedata?: boolean,
): LanguageSupport => {
	const mode = new FullMediaWiki(
			config,
			cm,
			templatedata,
		),
		lang = StreamLanguage.define(mode.mediawiki());
	return new LanguageSupport(lang, [
		lightHighlightStyle,
		getHighlightExtension(mode.getTagStyles()),
		wikiTheme,
		lang.data.of({autocomplete: mode.completionSource}),
	]);
};
