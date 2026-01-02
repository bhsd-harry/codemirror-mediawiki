/**
 * @author MusikAnimal, Bhsd and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {
	StreamLanguage,
	syntaxTree,
} from '@codemirror/language';
import {insertCompletionText, pickedCompletion} from '@codemirror/autocomplete';
import {isUnderscore} from '@bhsd/cm-util';
import {commonHtmlAttrs, htmlAttrs, extAttrs} from 'wikiparser-node/dist/util/sharable.mjs';
import {htmlTags, tokens} from './config.js';
import {
	isWMF,
} from './constants.js';
import {MediaWiki} from './token.js';
import {braceStackUpdate, hasTag} from './util.js';
import type {EditorView} from '@codemirror/view';
import type {
	StreamParser,
	Language,
} from '@codemirror/language';
import type {
	CloseBracketConfig,
	CompletionSource,
	Completion,
	CompletionResult,
} from '@codemirror/autocomplete';
import type {MwConfig} from './token';

/**
 * 是否是普通维基链接
 * @param name 节点名称
 */
export const isWikiLink = (name: string): boolean => /mw-[\w-]*link-ground/u.test(name);

/**
 * 检查首字母大小写并插入正确的自动填充内容
 * @param view
 * @param completion 自动填充内容
 * @param from 起始位置
 * @param to 结束位置
 */
const apply = (view: EditorView, completion: Completion, from: number, to: number): void => {
	let {label} = completion,
		selection;
	const initial = label.charAt(0).toLowerCase(),
		{state} = view,
		after = state.sliceDoc(to);
	if (state.sliceDoc(from, from + 1) === initial) {
		label = initial + label.slice(1);
	}
	if (!/^\s*\|/u.test(after)) {
		selection = {anchor: from + label.length + 1, head: from + label.length * 2 + 1};
		label += `|${label}${/^\s*\]\]/u.test(after) ? '' : ']]'}`;
	}
	view.dispatch({
		...insertCompletionText(state, label, from, to),
		annotations: pickedCompletion.of(completion),
		selection,
	});
};

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
			Object.keys(nsid).filter(ns => ns !== '').join('|')
				.replace(/_/gu, ' ')
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
	async #linkSuggest(str: string, ns: number): Promise<{offset: number, options: Completion[]} | undefined> {
		const {config: {linkSuggest, nsid}, nsRegex} = this;
		if (typeof linkSuggest !== 'function' || /[|{}<>[\]#]/u.test(str)) {
			return undefined;
		}
		let subpage = false,
			search = str,
			offset = 0;
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
		const underscore = str.slice(offset).includes('_');
		return {
			offset,
			options: (await linkSuggest(search, subpage, ns)).map(([label]): Completion => ({
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
				{name: n, from: f, to: t} = node,
				types = new Set(n.split('_')),
				isParserFunction = hasTag(types, 'parserFunctionName'),
				/** 开头不包含` `，但可能包含`_` */ search = state.sliceDoc(f, pos).trimStart(),
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
					const isLink = isWikiLink(n);
					let prefix = '',
						ns = 0;
					if (isPage) {
						prefix = this.autocompleteNamespaces[
							[...types].find(type => type.startsWith('mw-function-'))!
								.slice(12) as unknown as keyof typeof this.autocompleteNamespaces
						];
					} else if (hasTag(types, 'mw-tag-gallery') && !isLink) {
						ns = 6;
					}
					const suggestions = await this.#linkSuggest(prefix + search, ns);
					if (!suggestions) {
						return null;
					} else if (!isPage && isLink) {
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
						const equal = isArgument && state.sliceDoc(pos, t).trim() === '=' ? '' : '=',
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
			const extTags = [...types].filter(type => type.startsWith('mw-tag-'))
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

/**
 * Get the stream language for Wikitext.
 * @param config Configuration for the MediaWiki mode
 */
export const mediawiki = (config: MwConfig): Language => {
	const mode = new FullMediaWiki(config),
		lang = StreamLanguage.define(mode.mediawiki());
	return lang;
};
