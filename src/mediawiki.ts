/**
 * @author MusikAnimal, Bhsd and others
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {
	StreamLanguage,
	syntaxTree,
} from '@codemirror/language';
import {isUnderscore} from '@bhsd/cm-util';
import {commonHtmlAttrs, htmlAttrs, extAttrs} from 'wikiparser-node/dist/util/sharable.mjs';
import {htmlTags, tokens} from './config.js';
import {MediaWiki} from './token.js';
import {
	hasTag,
} from './util.js';
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

class FullMediaWiki extends MediaWiki {
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
			functionSynonyms,
			doubleUnderscore,
		} = config;
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

	/** 自动补全魔术字和标签名 */
	get completionSource(): CompletionSource {
		return (context): CompletionResult | null => {
			const {state, pos, explicit} = context,
				node = syntaxTree(state).resolve(pos, -1),
				{
					name: n,
					from: f,
				} = node,
				types = new Set(n.split('_')),
				isParserFunction = hasTag(types, 'parserFunctionName'),
				/** 开头不包含` `，但可能包含`_` */ search = state.sliceDoc(f, pos).trimStart(),
				start = pos - search.length;
			const obj = {
				options: this.functionSynonyms,
				validFor: /^[^|{}<>[\]#]*$/u,
			};
			if (isParserFunction || hasTag(types, 'templateName')) {
				return search.includes(':')
					? null
					: {
						from: start,
						...obj,
					};
			} else if (explicit && hasTag(types, 'templateBracket') && context.matchBefore(/\{\{$/u)) {
				return {
					from: pos,
					...obj,
				};
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
			const {prevSibling} = node;
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
