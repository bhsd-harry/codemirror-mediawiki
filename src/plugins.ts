import {javascript as js, javascriptLanguage, scopeCompletionSource} from '@codemirror/lang-javascript';
import {cssLanguage, cssCompletionSource} from '@codemirror/lang-css';
import {LanguageSupport, syntaxTree} from '@codemirror/language';
import {lua} from '@codemirror/legacy-modes/mode/lua';
import type {Extension} from '@codemirror/state';
import type {CompletionContext, CompletionResult, CompletionSource, Completion} from '@codemirror/autocomplete';
export {json as jsonLR} from '@codemirror/lang-json';
export {css} from '@codemirror/legacy-modes/mode/css';
export {javascript, json} from '@codemirror/legacy-modes/mode/javascript';

declare interface LuaGlobal {
	[x: string]: LuaGlobal | 1 | 2 | 3 | 4;
}

export const javascriptLR = (): Extension => [
	js(),
	javascriptLanguage.data.of({autocomplete: scopeCompletionSource(globalThis)}),
];

export const cssLR = (): Extension => new LanguageSupport(cssLanguage, cssLanguage.data.of({
	autocomplete(context: CompletionContext) {
		const {state, pos} = context,
			node = syntaxTree(state).resolveInner(pos, -1),
			result = cssCompletionSource(context) as CompletionResult | null;
		if (result && node.name === 'ValueName') {
			const options = [{label: 'revert', type: 'keyword'}, ...result.options];
			let {prevSibling} = node;
			while (prevSibling && prevSibling.name !== 'PropertyName') {
				({prevSibling} = prevSibling);
			}
			if (prevSibling) {
				for (let i = 0; i < options.length; i++) {
					const option = options[i]!;
					if (CSS.supports(state.sliceDoc(prevSibling.from, node.from) + option.label)) {
						options.splice(i, 1, {...option, boost: 50});
					}
				}
			}
			result.options = options;
		}
		return result;
	},
}));

const /** 位于` `之后 */ luaBinary: Completion[] = [
		'and',
		'or',
		'in',
	].map(label => ({label, type: 'keyword'})),
	/** 不位于`.`/`:`之后 */ luaUnary: Completion[] = [
		'not',
		'function',
	].map(label => ({label, type: 'keyword'})),
	/** 位于` `/`;`之后 */ luaKeyword: Completion[] = [
		'break',
		'elseif',
		'return',
		'end',
		'if',
		'then',
		'else',
		'do',
		'while',
		'repeat',
		'until',
		'for',
		'local',
	].map(label => ({label, type: 'keyword'})),
	map = {
		1: 'constant',
		2: 'function',
		3: 'interface',
		4: 'namespace',
	},
	luaGlobal: LuaGlobal = {
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
	/** 不位于`.`/`:`之后 */ luaConstant: Completion[] = [
		...[
			'false',
			'nil',
			'true',
			'_VERSION',
		].map(label => ({label, type: 'constant'})),
		...[
			'_G',
			...Object.keys(luaGlobal),
		].map(label => ({label, type: 'namespace'})),
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
	types = new Set(['variableName', 'variableName.standard', 'keyword']);
lua.languageData!['autocomplete'] = (context => {
	const {state, pos} = context,
		node = syntaxTree(state).resolveInner(pos, -1),
		{from, text} = context.matchBefore(/(?:^|\W)\w*$/u)!,
		char = /^\W/u.test(text) ? text.charAt(0) : '',
		validFor = /^\w*$/u;
	if (char === ':') {
		return null;
	} else if (char === '.') {
		const mt = context.matchBefore(/(?:^|[^\w.])\w[\w.]+$/u);
		if (mt) {
			const parts = (/^\w/u.test(mt.text) ? mt.text : mt.text.slice(1)).split('.');
			let cur: LuaGlobal | number | undefined = luaGlobal;
			for (const part of parts.slice(0, -1)) {
				cur = cur[part];
				if (typeof cur !== 'object') {
					return null;
				}
			}
			return {
				from: from + 1,
				options: Object.keys(cur).map((label): Completion => ({
					label,
					type: typeof cur[label] === 'object' ? 'namespace' : map[cur[label]!],
				})),
				validFor,
			};
		}
	} else if (/\w/u.test(text) && types.has(node.name)) {
		const options = [...luaUnary, ...luaConstant];
		if (char === ';' || !char.trim()) {
			options.push(...luaKeyword);
			if (char !== ';') {
				options.push(...luaBinary);
			}
		}
		return {
			from: from + char.length,
			options,
			validFor,
		};
	}
	return null;
}) as CompletionSource;

export {lua};
