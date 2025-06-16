import {lua} from '@codemirror/legacy-modes/mode/lua';
import {syntaxTree, LanguageSupport, StreamLanguage} from '@codemirror/language';
import type {CompletionSource, Completion} from '@codemirror/autocomplete';

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
			getCurrentFrame: 2,
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
	builtin = ['false', 'nil', 'true'],
	builtins: Completion[] = builtin.map(label => ({label, type: 'constant'})),
	tables: Completion[] = [
		'_G',
		...Object.keys(globals),
	].map(label => ({label, type: 'namespace'})),
	constants: Completion[] = [
		{label: '_VERSION', type: 'constant'},
		...[
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
		].map(label => ({label, type: 'function'})),
	],
	binary: Completion[] = [
		'and',
		'or',
		'in',
	].map(label => ({label, type: 'keyword'})),
	unary: Completion[] = [
		'not',
		'function',
	].map(label => ({label, type: 'keyword'})),
	blocks: Completion[] = [
		'break',
		'elseif',
		'return',
		'end',
		'then',
		'else',
		'do',
		'until',
		'goto',
	].map(label => ({label, type: 'keyword'})),
	keywords: Completion[] = [
		'if',
		'while',
		'repeat',
		'for',
		'local',
	].map(label => ({label, type: 'keyword'})),
	types = new Set(['variableName', 'variableName.standard', 'keyword']);
lua.languageData!['autocomplete'] = (context => {
	const {state, pos} = context,
		node = syntaxTree(state).resolveInner(pos, -1);
	if (!types.has(node.name)) {
		return null;
	}
	const {from: f, text} = context.matchBefore(/(?:(?:^|\S|\.\.)\s+|^|[^\w\s]|\.\.)\w*$/u)!,
		pre = /^(.*?)(?:\b\w*)?$/u.exec(text)![1]!,
		char = pre.trim();
	if (char !== '.' && !/\w$/u.test(text)) {
		return null;
	}
	const from = f + pre.length,
		validFor = /^\w*$/u;
	switch (char) {
		case '.': {
			const mt = context.matchBefore(/(?:^|[^\w.]|\.\.)\w(?:\w|\.(?!\.))+$/u);
			if (mt) {
				let cur: LuaGlobal | number | undefined = globals,
					s = mt.text;
				if (s.startsWith('.')) {
					s = s.slice(2);
				} else if (/^\W/u.test(s)) {
					s = s.slice(1);
				}
				for (const part of s.split('.').slice(0, -1)) {
					cur = cur[part];
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
		case '..':
		case '+':
		case '-':
		case '*':
		case '/':
		case '%':
		case '^':
		case '&':
		case '|':
		case '~':
		case '<':
		case '>':
		case '[':
			return {
				from,
				options: [...constants, ...tables],
				validFor,
			};
		case '=':
		case '{':
		case '(':
		case ',':
			return {
				from,
				options: [...builtins, ...constants, ...tables, ...unary],
				validFor,
			};
		case '}':
		case ']':
		case ')':
			return {
				from,
				options: [...binary, ...blocks],
				validFor,
			};
		case ';':
		case '':
			return {
				from,
				options: [...keywords, ...blocks, ...unary, ...constants, ...tables, ...builtins],
				validFor,
			};
		default:
			if (pre !== char) {
				const {prevSibling} = node;
				return {
					from,
					options: prevSibling?.name !== 'keyword'
						|| builtin.includes(state.sliceDoc(prevSibling.from, prevSibling.to))
						? [...binary, ...blocks]
						: [...builtins, ...constants, ...tables, ...unary, ...blocks],
					validFor,
				};
			}
	}
	return null;
}) as CompletionSource;

export default (): LanguageSupport => new LanguageSupport(StreamLanguage.define(lua));
export {lua};
