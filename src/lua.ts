/* eslint-disable no-template-curly-in-string */
import {lua} from '@codemirror/legacy-modes/mode/lua';
import {Decoration} from '@codemirror/view';
import {countColumn} from '@codemirror/state';
import {syntaxTree, LanguageSupport, StreamLanguage} from '@codemirror/language';
import {snippetCompletion} from '@codemirror/autocomplete';
import {tags} from '@lezer/highlight';
import {linkMark, isWMF} from './constants.js';
import {
	leadingSpaces,
	sliceDoc,
	markDocTagType,
	getCompletions,
	pushDecoration,
	useUnderscore,
	getHighlightExtension,
	getFoldService,
	markLinks,
	getMarkPlugin,
} from './util.js';
import {lightHighlightStyle} from './theme.js';
import type {EditorState, Range} from '@codemirror/state';
import type {CompletionSource, Completion} from '@codemirror/autocomplete';
import type {SyntaxNode} from '@lezer/common';
import type {ApiSuggest, LinkSuggestion, TitleParser} from './token';
import type {Mark} from './util';
import type {CodeMirror6} from './codemirror';

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
				interwikiMap: 2,
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
	libraries = getCompletions(['bit32', 'libraryUtil', 'luabit.bit', 'luabit.hex', 'strict'], 'namespace'),
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
	reLink = /^(['"]).+\1$|^\[(=*)\[.+\]\2\]$/u,
	reLinkIncomplete = /^(['"]|\[=*\[).*$/u,
	lang = StreamLanguage.define(lua);

/**
 * @implements
 * @test
 */
const basicSource: CompletionSource = context => {
	const {state, pos} = context,
		node = syntaxTree(state).resolveInner(pos, -1),
		{name, from: fr, prevSibling: prev} = node;
	if (
		name === 'string'
		&& pos > fr
		&& prev?.name === 'variableName.standard'
		&& sliceDoc(state, prev) === 'require'
	) {
		const offset = getStringOffset(state.sliceDoc(fr, pos));
		if (!offset || pos <= fr + offset) {
			return null;
		}
		const search = state.sliceDoc(fr + offset, pos);
		if (search.includes(':')) {
			return null;
		}
		return {
			from: fr + offset,
			options: libraries,
			validFor: /^[\w.]*$/u,
		};
	} else if (!excludedTypes.has(name)) {
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
					options: Object.entries(cur).map(([label, value]): Completion => ({
						label,
						type: typeof value === 'object' ? 'namespace' : map[value],
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

const getSource = (linkSuggest?: ApiSuggest<LinkSuggestion>, titleParser?: TitleParser): CompletionSource =>
	async context => {
		const {state, pos, explicit} = context,
			node = syntaxTree(state).resolveInner(pos, -1),
			{name, from: fr} = node;
		if (linkSuggest && name === 'string' && (explicit || isWMF) && pos > fr) {
			const title = titleParser?.(state, node);
			if (!title) {
				return null;
			}
			const {range, contentmodel} = title,
				[from] = range!;
			if (pos <= from) {
				return null;
			}
			const search = state.sliceDoc(from, pos);
			if (/[|{}<>[\]#]/u.test(search)) {
				return null;
			}
			const suggestions = await linkSuggest(
					search,
					false,
					contentmodel === 'sanitized-css' ? 10 : 0,
					contentmodel,
				),
				underscore = search.includes('_');
			return suggestions.length === 0
				? null
				: {
					from,
					options: suggestions.map(([label]): Completion => ({
						label: useUnderscore(label, underscore),
						type: 'text',
					})),
					...isWMF ? {filter: false} : {validFor: /^[^|{}<>[\]#]*$/u},
				};
		}
		return null;
	};

/**
 * 高亮显示LDoc标签
 * @ignore
 * @test
 */
export const markDocTag: Mark = (tree, visibleRanges, state, cm) => {
	const decorations: Range<Decoration>[] = [],
		titleParser = cm?.langConfig?.titleParser;
	for (const {from, to} of visibleRanges) {
		let node: SyntaxNode | null | undefined = tree.resolveInner(from, 1);
		while (node && node.from < to) {
			if (node.name === 'comment') {
				const firstLine = sliceDoc(state, node),
					block = firstLine.startsWith('--[[--');
				markLinks(firstLine, decorations, node.from, true);
				if (
					block
					|| firstLine.startsWith('---')
					&& !(firstLine.endsWith('--') && /[^-]/u.test(firstLine))
				) {
					while (node.name === 'comment') {
						const comment = sliceDoc(state, node),
							// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
							{from: f, to: t, nextSibling} = node as SyntaxNode,
							mt = /^\s*(?:-{2,}\s*)?(@[a-z]+)(\s+\{)?/diu.exec(comment);
						markLinks(comment, decorations, f, true);
						if (mt) {
							markDocTagType(decorations, f, mt, 1);
						}
						if (
							!nextSibling || (
								block
									? comment.endsWith(']]')
									: state.sliceDoc(t, nextSibling.from)
										.split('\n', 3).length > 2
							)
						) {
							break;
						}
						node = nextSibling;
					}
				}
			} else if (titleParser) {
				const title = titleParser(state, node);
				if (title) {
					pushDecoration(decorations, linkMark, title.range![0], title.range![1]);
				}
			}
			node = node.nextSibling;
		}
	}
	return Decoration.set(decorations, true);
};

/**
 * @ignore
 * @test
 */
export const getStringOffset = (str: string, re = reLinkIncomplete): number | null => {
	const mt = re.exec(str);
	return mt && (mt[1]?.length ?? mt[2]!.length + 2);
};

/**
 * @ignore
 * @test
 */
export const getStringOffsetFull = (
	state: EditorState,
	node: SyntaxNode,
	str?: string,
): [number, string, string] | null => {
	if (node.name !== 'string') {
		return null;
	}
	const {prevSibling} = node;
	if (
		(prevSibling?.name === 'variableName' || prevSibling?.name === 'variableName.standard')
		&& !/[^\s(]/u.test(state.sliceDoc(prevSibling.to, node.from))
	) {
		const func = sliceDoc(state, prevSibling),
			isLua = func === 'require' || func === 'mw.loadData';
		let contentmodel: string | undefined;
		if (isLua) {
			contentmodel = 'Scribunto';
		} else if (func === 'mw.loadJsonData') {
			contentmodel = 'json';
		} else if (func === 'mw.ext.TemplateStyles.link') {
			contentmodel = 'sanitized-css';
		}
		if (contentmodel) {
			const offset = getStringOffset(str ?? sliceDoc(state, node), str ? reLinkIncomplete : reLink);
			return offset === null ? null : [offset, contentmodel, func];
		}
	}
	return null;
};

export default (config?: {linkSuggest?: ApiSuggest<LinkSuggestion>}, cm?: CodeMirror6): LanguageSupport =>
	new LanguageSupport(lang, [
		lightHighlightStyle,
		getHighlightExtension([{tag: tags.standard(tags.variableName), class: 'cm-globals'}]),
		lang.data.of({autocomplete: basicSource}),
		lang.data.of({autocomplete: getSource(config?.linkSuggest, cm?.langConfig?.titleParser)}),
		getMarkPlugin(markDocTag, cm),
		getFoldService(({doc, tabSize}, start, from) => {
			const {text, number} = doc.lineAt(start);
			if (!text.trim()) {
				return null;
			}
			const getIndent = (line: string): number => countColumn(leadingSpaces(line), tabSize);
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
		}),
	]);
