import {inComment, getCompletions} from './util.js';
import {extData, extCompletion} from './constants.js';
import type {StreamParser, StringStream} from '@codemirror/language';

declare interface State {
	tokenize: Tokenizer;

	/** 只用于Scheme */
	parens: number;

	/** 只用于歌词 */
	braces: number;

	/** 只用于歌词 */
	spaced: boolean;
	lyrics: boolean;
}
declare type Tokenizer = (stream: StringStream, state: State) => string;

let scoreFetch: Promise<void> | undefined;

const inString = (parent: Tokenizer): Tokenizer => (stream, state) => {
	let escaped = false,
		next = stream.next();
	while (next) {
		if (!escaped && next === '"') {
			state.tokenize = parent;
			return /* #a11 */ 'string';
		}
		escaped = !escaped && next === '\\';
		next = stream.next();
	}
	return /* #a11 */ 'string';
};

const inScheme = (parent: Tokenizer): Tokenizer => {
	const style = 'mw-tag-score-scheme';
	const tokenizer: Tokenizer = (stream, state) => {
		if (stream.eatSpace()) {
			return style;
		}
		const ch = stream.next()!;
		switch (ch) {
			case '(':
				state.parens++;
				return style;
			case ')':
				state.parens--;
				if (state.parens === 0) {
					state.tokenize = parent;
					return 'separator';
				}
				return style;
			case '"':
				state.tokenize = inString(tokenizer);
				return /* #a11 */ `string ${style}`;
			case ';':
				stream.skipToEnd();
				return /* #940 */ `comment ${style}`;
			case '#':
				if (stream.eat('!')) {
					state.tokenize = inComment(tokenizer, '!#');
					return /* #940 */ `comment ${style}`;
				}
				// fall through
			default:
				return style;
		}
	};
	return tokenizer;
};

const eatHash = (stream: StringStream, state: State, ch: '#' | '$', parent: Tokenizer): string => {
	if (stream.match(/^#[tf]/u)) {
		return /* #219 */ 'bool';
	} else if (ch === '#' && stream.match(/^(?:\d+|#x[\da-f]*)/iu)) {
		return /* #a11 */ 'character';
	} else if (stream.eat('(')) {
		state.tokenize = inScheme(parent);
		state.parens = 1;
		return 'separator';
	}
	return stream.match(/^\s*[-_a-z][-\w]*/iu) ? 'variableName.local' : 'operator';
};

const eatQuote = (state: State, parent: Tokenizer): string => {
	state.tokenize = inString(parent);
	return /* #a11 */ 'string';
};

const eatPercent = (stream: StringStream, state: State, parent: Tokenizer): string => {
	if (stream.eat('{')) {
		state.tokenize = inComment(parent, '%}');
		return /* #940 */ 'comment';
	}
	stream.skipToEnd();
	return /* #940 */ 'comment';
};

const lyricsCommands = new Set<string | undefined>(['addlyrics', 'lyricmode', 'lyrics', 'lyricsto']),
	setCommands = new Set<string | undefined>(['set', 'override']),
	unsetCommands = new Set<string | undefined>(['unset', 'revert', 'tweak']),
	newCommands = new Set<string | undefined>(['new', 'context']);

const eatCommand = (stream: StringStream, state: State, parent: Tokenizer, base?: boolean): string => {
	const mt = stream.match(/^[a-z](?:[a-z]|-+(?=[a-z]))*/iu) as RegExpMatchArray | null,
		cmd = mt?.[0],
		isUnset = unsetCommands.has(cmd),
		isNew = newCommands.has(cmd);
	if (base && lyricsCommands.has(cmd)) {
		state.lyrics = true;
	} else if (isUnset || isNew || setCommands.has(cmd)) {
		state.tokenize = inAssignment(parent, isUnset ? -1 : 1, isNew);
	}
	return mt && extData['score']?.has(`\\${cmd}`) !== false ? /* #708 */ 'keyword' : '';
};

const inAssignment = (parent: Tokenizer, step: -1 | 0 | 1, cls?: boolean): Tokenizer => (stream, state) => {
	if (stream.eatSpace()) {
		return '';
	} else if (step === 0) {
		stream.eat('=');
		state.tokenize = parent;
		return 'operator';
	}
	stream.match(/^[a-z][-\w.]*/iu);
	state.tokenize = step === 1 ? inAssignment(parent, 0) : parent;
	return cls ? /* #167 */ 'className' : /* #00f */ 'variableName.definition';
};

const inBase: Tokenizer = (stream, state) => {
	if (stream.eatSpace()) {
		return '';
	}
	const ch = stream.next()!;
	switch (ch) {
		case '-':
			return stream.eat(/[->.+_!^]/u) ? 'operator' : 'punctuation';
		case '#':
		case '$':
			return eatHash(stream, state, ch, inBase);
		case '"':
			return eatQuote(state, inBase);
		case '%':
			return eatPercent(stream, state, inBase);
		case '/':
			stream.eat('+');
			return 'punctuation';
		case '\\':
			if (stream.eat(/[-<>!]/u)) {
				return 'operator';
			} else if (stream.eat(/[()[\]]/u)) {
				return 'squareBracket';
			}
			return stream.eat(/[\\=]/u) ? 'punctuation' : eatCommand(stream, state, inBase, true);
		case '}':
			state.lyrics = false;
			return 'squareBracket';
		case '{':
			if (state.lyrics) {
				state.lyrics = false;
				state.braces = 1;
				state.spaced = true;
				state.tokenize = inLyrics;
			}
			return 'squareBracket';
		default:
			if (/[<>()[\]]/u.test(ch)) {
				return 'squareBracket';
			} else if (/[:|~^_=]/u.test(ch)) {
				return 'punctuation';
			} else if (/[',.!?]/u.test(ch)) {
				return 'operator';
			} else if (/\d/u.test(ch)) {
				stream.match(/^\d*(?:[./]\d+)?/u);
				return /* #164 */ 'number';
			} else if (/[a-z]/iu.test(ch)) {
				stream.match(/^(?:[a-z]|[-_\d]+(?=[a-z]))+/iu);
				return /^(?:[rs]|[a-g](?:is)*(?:ih)*|[a-g]?(?:es)*(?:eh)*)$/u.test(stream.current())
					? ''
					: /* #219 */ 'atom';
			}
			return '';
	}
};

const inLyrics: Tokenizer = (stream, state) => {
	if (stream.eatSpace()) {
		state.spaced = true;
		return '';
	} else if (stream.sol()) {
		state.spaced = true;
	}
	const ch = stream.next()!;
	switch (ch) {
		case '-':
			if (state.spaced && stream.match(/^-(?=\s)/u)) {
				return 'punctuation';
			}
			state.spaced = false;
			return 'string';
		case '_':
		case '~':
		case '|':
			state.spaced = false;
			return 'punctuation';
		case '#':
		case '$':
			state.spaced = false;
			return eatHash(stream, state, ch, inLyrics);
		case '"':
			state.spaced = true;
			return eatQuote(state, inLyrics);
		case '%':
			state.spaced = true;
			return eatPercent(stream, state, inLyrics);
		case '\\':
			if (stream.eat(/[<>!\\]/u)) {
				state.spaced = true;
				return '';
			}
			state.spaced = false;
			return eatCommand(stream, state, inLyrics);
		case '{':
		case '}':
			state.braces += ch === '{' ? 1 : -1;
			if (state.braces) {
				state.spaced = true;
			} else {
				state.tokenize = inBase;
			}
			return 'squareBracket';
		default:
			state.spaced = false;
			if (/\d/u.test(ch)) {
				stream.eatWhile(/\d/u);
				return /* #164 */ 'number';
			}
			stream.eatWhile(/[^\s\d_~{}#$"%\\]/u);
			return /* #a11 */ 'string';
	}
};

export const lilypond: StreamParser<State> = {
	startState() {
		if (typeof wikiparse === 'object') {
			scoreFetch ??= (async () => {
				const data: string[] = await (await fetch(`${wikiparse.CDN}/data/ext/score.json`)).json();
				extData['score'] = new Set(data.flatMap(item => item.split('.')));
				extCompletion['score'] = getCompletions(
					data.filter(s => s.startsWith('\\')),
					'keyword',
				);
			})();
		}
		return {
			tokenize: inBase,
			parens: 0,
			braces: 0,
			lyrics: false,
			spaced: false,
		};
	},

	token(stream, state): string {
		return state.tokenize(stream, state);
	},
};
