/* eslint-disable no-template-curly-in-string */
import {lua} from '@codemirror/legacy-modes/mode/lua';
import {ViewPlugin, Decoration} from '@codemirror/view';
import {
	syntaxTree,
	LanguageSupport,
	StreamLanguage,
	foldService,
	HighlightStyle,
	syntaxHighlighting,
} from '@codemirror/language';
import {snippetCompletion} from '@codemirror/autocomplete';
import {tags} from '@lezer/highlight';
import {linkSelector, isWMF} from './constants.js';
import {leadingSpaces, sliceDoc, markDocTagType, getCompletions, pushDecoration, useUnderscore} from './util.js';
import {lightHighlightStyle} from './theme.js';
import type {PluginValue, EditorView, ViewUpdate, DecorationSet} from '@codemirror/view';
import type {Extension, EditorState, Range} from '@codemirror/state';
import type {CompletionSource, Completion} from '@codemirror/autocomplete';
import type {Tree, SyntaxNode} from '@lezer/common';
import type {ApiSuggest, LinkSuggestion} from './token';
import type {DocRange} from './util';

declare interface LuaGlobal {
	[x: string]: LuaGlobal | 1 | 2 | 3 | 4;
}

const map = {
		1: 'constant',
		2: 'function',
		3: 'interface',
		4: 'namespace',
	},
	globals: LuaGlobal = {
		debug: {
			traceback: 2,
		},
		math: {
			abs: 2,
			acos: 2,
			asin: 2,
			atan: 2,
			atan2: 2,
			ceil: 2,
			cos: 2,
			cosh: 2,
			deg: 2,
			exp: 2,
			floor: 2,
			fmod: 2,
			frexp: 2,
			huge: 1,
			ldexp: 2,
			log: 2,
			log10: 2,
			max: 2,
			min: 2,
			modf: 2,
			pi: 1,
			pow: 2,
			rad: 2,
			random: 2,
			randomseed: 2,
			sin: 2,
			sinh: 2,
			sqrt: 2,
			tan: 2,
			tanh: 2,
		},
		os: {
			clock: 2,
			date: 2,
			difftime: 2,
			time: 2,
		},
		package: {
			loaded: 3,
			loaders: 3,
			preload: 3,
			seeall: 2,
		},
		string: {
			byte: 2,
			char: 2,
			find: 2,
			format: 2,
			gmatch: 2,
			gsub: 2,
			len: 2,
			lower: 2,
			match: 2,
			rep: 2,
			reverse: 2,
			sub: 2,
			ulower: 2,
			upper: 2,
			uupper: 2,
		},
		table: {
			concat: 2,
			insert: 2,
			maxn: 2,
			remove: 2,
			sort: 2,
		},
		mw: {
			addWarning: 2,
			allToString: 2,
			clone: 2,
			getContentLanguage: 2,
			getCurrentFrame: 2,
			getLanguage: 2,
			incrementExpensiveFunctionCount: 2,
			isSubsting: 2,
			loadData: 2,
			loadJsonData: 2,
			dumpObject: 2,
			log: 2,
			logObject: 2,
			hash: {
				hashValue: 2,
				listAlgorithms: 2,
			},
			html: {
				create: 2,
			},
			language: {
				fetchLanguageName: 2,
				fetchLanguageNames: 2,
				getContentLanguage: 2,
				getFallbacksFor: 2,
				isKnownLanguageTag: 2,
				isSupportedLanguage: 2,
				isValidBuiltInCode: 2,
				isValidCode: 2,
				new: 2,
				FALLBACK_MESSAGES: 1,
				FALLBACK_STRICT: 1,
			},
			message: {
				new: 2,
				newFallbackSequence: 2,
				newRawMessage: 2,
				rawParam: 2,
				numParam: 2,
				getDefaultLanguage: 2,
			},
			site: {
				currentVersion: 1,
				scriptPath: 1,
				server: 1,
				siteName: 1,
				stylePath: 1,
				wikiId: 1,
				namespaces: 3,
				contentNamespaces: 3,
				subjectNamespaces: 3,
				talkNamespaces: 3,
				stats: {
					pages: 1,
					articles: 1,
					files: 1,
					edits: 1,
					users: 1,
					activeUsers: 1,
					admins: 1,
					pagesInCategory: 2,
					pagesInNamespace: 2,
					usersInGroup: 2,
					interwikiMap: 2,
				},
			},
			svg: {
				new: 2,
			},
			text: {
				decode: 2,
				encode: 2,
				jsonDecode: 2,
				jsonEncode: 2,
				killMarkers: 2,
				listToText: 2,
				nowiki: 2,
				split: 2,
				gsplit: 2,
				tag: 2,
				trim: 2,
				truncate: 2,
				unstripNoWiki: 2,
				unstrip: 2,
				JSON_PRESERVE_KEYS: 1,
				JSON_TRY_FIXING: 1,
				JSON_PRETTY: 1,
			},
			title: {
				equals: 2,
				compare: 2,
				getCurrentTitle: 2,
				new: 2,
				newBatch: 2,
				makeTitle: 2,
			},
			uri: {
				encode: 2,
				decode: 2,
				anchorEncode: 2,
				buildQueryString: 2,
				parseQueryString: 2,
				canonicalUrl: 2,
				fullUrl: 2,
				localUrl: 2,
				new: 2,
				validate: 2,
			},
			ustring: {
				maxPatternLength: 1,
				maxStringLength: 1,
				byte: 2,
				byteoffset: 2,
				char: 2,
				codepoint: 2,
				find: 2,
				format: 2,
				gcodepoint: 2,
				gmatch: 2,
				gsub: 2,
				isutf8: 2,
				len: 2,
				lower: 2,
				match: 2,
				rep: 2,
				sub: 2,
				toNFC: 2,
				toNFD: 2,
				toNFKC: 2,
				toNFKD: 2,
				upper: 2,
			},
			ext: 4,
		},
	},
	luaBuiltin = ['false', 'nil', 'true'],
	luaBuiltins = getCompletions(luaBuiltin, 'constant'),
	tables = getCompletions(['_G', ...Object.keys(globals)], 'namespace'),
	constants = [
		{label: '_VERSION', type: 'constant'},
		...getCompletions([
			'assert',
			'error',
			'getfenv',
			'getmetatable',
			'ipairs',
			'next',
			'pairs',
			'pcall',
			'rawequal',
			'rawget',
			'rawset',
			'select',
			'setmetatable',
			'tonumber',
			'tostring',
			'type',
			'unpack',
			'xpcall',
			'require',
		], 'function'),
	],
	binary = getCompletions(['and', 'or', 'in']),
	unary = [
		...getCompletions(['not', 'function']),
		snippetCompletion('function ${name}(${})\n\t${}\nend', {
			label: 'function',
			detail: 'definition',
			type: 'keyword',
		}),
	],
	blocks = getCompletions([
		'break',
		'elseif',
		'return',
		'end',
		'then',
		'else',
		'do',
		'until',
		'goto',
	]),
	luaKeywords = [
		...getCompletions([
			'if',
			'while',
			'repeat',
			'for',
			'local',
		]),
		snippetCompletion('if ${condition} then\n\t${}\nend', {
			label: 'if',
			detail: 'block',
			type: 'keyword',
		}),
		snippetCompletion('if ${condition} then\n\t${}\nelse\n\t${}\nend', {
			label: 'if',
			detail: '/ else block',
			type: 'keyword',
		}),
		snippetCompletion('while ${condition} do\n\t${}\nend', {
			label: 'while',
			detail: 'loop',
			type: 'keyword',
		}),
		snippetCompletion('repeat \n\t${}\nuntil ${condition}', {
			label: 'repeat',
			detail: 'loop',
			type: 'keyword',
		}),
		snippetCompletion('for ${name} = ${from}, ${to}, ${step} do\n\t${}\nend', {
			label: 'for',
			detail: 'loop',
			type: 'keyword',
		}),
		snippetCompletion('for ${...} in ${...} do\n\t${}\nend', {
			label: 'for',
			detail: 'in loop',
			type: 'keyword',
		}),
	],
	excludedTypes = new Set(['variableName', 'variableName.standard', 'keyword']),
	linkDeco = Decoration.mark({class: linkSelector.slice(1)}),
	reLink = ['', String.raw`module\s*:`]
		.map(s => new RegExp(String.raw`^(['"])${s}.+\1$|^\[(=*)\[${s}.+\]\2\]$`, 'iu')),
	reLinkIncomplete = ['', String.raw`module\s*:`]
		.map(s => new RegExp(String.raw`^(['"]|\[=*\[)${s}.*$`, 'iu')),
	lang = StreamLanguage.define(lua);

/**
 * @implements
 * @test
 */
const getSource = (linkSuggest?: ApiSuggest<LinkSuggestion>): CompletionSource => async context => {
	const {state, pos, explicit} = context,
		node = syntaxTree(state).resolveInner(pos, -1);
	if ((explicit || isWMF) && linkSuggest && node.name === 'string' && pos > node.from) {
		const offsetFull = getStringOffsetFull(state, node, state.sliceDoc(node.from, pos));
		if (!offsetFull || pos <= node.from + offsetFull[0]) {
			return null;
		}
		const [offset, isJson] = offsetFull,
			search = state.sliceDoc(node.from + offset, pos);
		if (/[|{}<>[\]#]/u.test(search)) {
			return null;
		}
		const suggestions = await linkSuggest(
				search,
				false,
				0,
				isJson ? 'json' : 'Scribunto',
			),
			underscore = search.includes('_');
		return suggestions.length === 0
			? null
			: {
				from: node.from + offset,
				options: suggestions.map(([label]): Completion => ({
					label: useUnderscore(label, underscore),
					type: 'text',
				})),
				...!isWMF && {validFor: /^[^|{}<>[\]#]*$/u},
			};
	} else if (!excludedTypes.has(node.name)) {
		return null;
	}
	const match = context.matchBefore(/(?:(?:^|\S|\.\.)\s+|^|[^\w\s]|\.\.)\w+$|\.{1,2}$/u);
	if (!match || match.text === '..') {
		return null;
	}
	const {from: f, text} = match,
		pre = /^(.*?)(?:\b\w*)?$/u.exec(text)![1]!,
		char = pre.trim(),
		from = f + pre.length,
		validFor = /^\w*$/u;
	switch (char) {
		case '.': {
			const mt = context.matchBefore(/(?:^|[^\w.]|\.\.)\w(?:\w|\.(?!\.))+$/u);
			if (mt) {
				let cur: LuaGlobal | number | false | undefined = globals,
					s = mt.text;
				if (s.startsWith('.')) {
					s = s.slice(2);
				} else if (/^\W/u.test(s)) {
					s = s.slice(1);
				}
				for (const part of s.split('.').slice(0, -1)) {
					cur = Object.hasOwn(cur, part) && cur[part];
					if (typeof cur !== 'object') {
						return null;
					}
				}
				return {
					from,
					options: Object.keys(cur).map((label): Completion => ({
						label,
						type: typeof cur[label] === 'object' ? 'namespace' : map[cur[label]!],
					})),
					validFor,
				};
			}
			break;
		}
		case '#':
			if (pre === char) {
				return {
					from,
					options: tables,
					validFor,
				};
			}
			break;
		case ';':
		case '':
			return {
				from,
				options: [...luaKeywords, ...blocks, ...unary, ...constants, ...tables, ...luaBuiltins],
				validFor,
			};
		default:
			if (/\.\.|[-+*/%^&|~<>[]/u.test(char)) {
				return {
					from,
					options: [...constants, ...tables],
					validFor,
				};
			} else if (/[={(,]/u.test(char)) {
				return {
					from,
					options: [...luaBuiltins, ...constants, ...tables, ...unary],
					validFor,
				};
			} else if (/[}\])]/u.test(char)) {
				return {
					from,
					options: [...binary, ...blocks],
					validFor,
				};
			} else if (pre !== char) {
				const {prevSibling} = node;
				return {
					from,
					options: prevSibling?.name !== 'keyword'
						|| luaBuiltin.includes(sliceDoc(state, prevSibling))
						? [...binary, ...blocks]
						: [...luaBuiltins, ...constants, ...tables, ...unary, ...blocks],
					validFor,
				};
			}
	}
	return null;
};

/**
 * @implements
 * @test
 */
const fold = ({doc, tabSize}: EditorState, start: number, from: number): DocRange | null => {
	const {text, number} = doc.lineAt(start);
	if (!text.trim()) {
		return null;
	}
	const getIndent = (line: string): number =>
		leadingSpaces(line).replaceAll('\t', ' '.repeat(tabSize)).length;
	const indent = getIndent(text);
	let j = number,
		empty = true;
	for (; j < doc.lines; j++) {
		const {text: next} = doc.line(j + 1);
		if (next.trim()) {
			const nextIndent = getIndent(next);
			if (indent >= nextIndent) {
				break;
			}
			empty = false;
		}
	}
	return empty || j === number ? null : {from, to: doc.line(j).to};
};

/**
 * 高亮显示LDoc标签
 * @ignore
 * @test
 */
export const markDocTag = (tree: Tree, visibleRanges: readonly DocRange[], state: EditorState): DecorationSet => {
	const decorations: Range<Decoration>[] = [];
	for (const {from, to} of visibleRanges) {
		let node: SyntaxNode | null | undefined = tree.resolveInner(from, 1);
		while (node && node.from < to) {
			if (node.name === 'comment') {
				const firstLine = sliceDoc(state, node),
					block = firstLine.startsWith('--[[--');
				if (
					block
					|| firstLine.startsWith('---')
					&& !(firstLine.endsWith('--') && /[^-]/u.test(firstLine))
				) {
					while (node.name === 'comment') {
						const comment = sliceDoc(state, node),
							mt = /^\s*(?:-{2,}\s*)?(@[a-z]+)(\s+\{)?/diu.exec(comment);
						if (mt) {
							markDocTagType(decorations, node.from, mt, 1);
						}
						// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
						const {nextSibling} = node as SyntaxNode;
						if (
							!nextSibling || (
								block
									? comment.endsWith(']]')
									: state.sliceDoc(node.to, nextSibling.from)
										.split('\n', 3).length > 2
							)
						) {
							break;
						}
						node = nextSibling;
					}
				}
			} else {
				const offset = getStringOffsetFull(state, node);
				if (offset) {
					pushDecoration(decorations, linkDeco, node.from + offset[0], node.to - offset[0]);
				}
			}
			node = node.nextSibling;
		}
	}
	return Decoration.set(decorations);
};

/**
 * @ignore
 * @test
 */
export const getStringOffset = (state: EditorState, node: SyntaxNode | string, re = reLink[0]!): number | null => {
	const mt = re.exec(typeof node === 'string' ? node : sliceDoc(state, node));
	return mt && (mt[1]?.length ?? mt[2]!.length + 2);
};

/**
 * @ignore
 * @test
 */
export const getStringOffsetFull = (state: EditorState, node: SyntaxNode, str?: string): [number, boolean] | null => {
	if (node.name !== 'string') {
		return null;
	}
	const {prevSibling} = node;
	if (
		(prevSibling?.name === 'variableName' || prevSibling?.name === 'variableName.standard')
		&& /^[\s(]*$/u.test(state.sliceDoc(prevSibling.to, node.from))
	) {
		const func = sliceDoc(state, prevSibling),
			isJson = func === 'mw.loadJsonData';
		if (isJson || func === 'require' || func === 'mw.loadData') {
			const offset = getStringOffset(state, str ?? node, (str ? reLinkIncomplete : reLink)[isJson ? 0 : 1]);
			return offset === null ? null : [offset, isJson];
		}
	}
	return null;
};

export const markDocTagPlugin = ViewPlugin.fromClass(
	class implements PluginValue {
		declare tree;
		declare decorations;

		constructor({state, visibleRanges}: EditorView) {
			this.tree = syntaxTree(state);
			this.decorations = markDocTag(this.tree, visibleRanges, state);
		}

		update({docChanged, viewportChanged, state, view: {visibleRanges}}: ViewUpdate): void {
			const tree = syntaxTree(state);
			if (docChanged || viewportChanged || tree !== this.tree) {
				this.tree = tree;
				this.decorations = markDocTag(tree, visibleRanges, state);
			}
		}
	},
	{
		decorations(v) {
			return v.decorations;
		},
	},
);

const getSupport = (linkSuggest?: ApiSuggest<LinkSuggestion>): Extension => [
	lightHighlightStyle,
	syntaxHighlighting(HighlightStyle.define([{tag: tags.standard(tags.variableName), class: 'cm-globals'}])),
	lang.data.of({autocomplete: getSource(linkSuggest)}),
	foldService.of(fold),
	markDocTagPlugin,
];

export default (config?: {linkSuggest?: ApiSuggest<LinkSuggestion>}): LanguageSupport =>
	new LanguageSupport(lang, getSupport(config?.linkSuggest));
