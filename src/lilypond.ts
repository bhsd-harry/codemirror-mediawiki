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
	const tokenizer: Tokenizer = (stream, state) => {
		if (stream.eatSpace()) {
			return '';
		}
		const ch = stream.next()!;
		switch (ch) {
			case '(':
				state.parens++;
				return '';
			case ')':
				state.parens--;
				if (state.parens === 0) {
					state.tokenize = parent;
					return 'separator';
				}
				return '';
			case '"':
				state.tokenize = inString(tokenizer);
				return /* #a11 */ 'string';
			case ';':
				stream.skipToEnd();
				return /* #940 */ 'comment';
			case '#':
				if (stream.eat('!')) {
					state.tokenize = inComment(tokenizer, '!#');
					return /* #940 */ 'comment';
				}
				// fall through
			default:
				return '';
		}
	};
	return tokenizer;
};

const eatHash = (stream: StringStream, state: State, ch: '#' | '$', parent: Tokenizer): string => {
	if (ch === '#' && stream.match(/^#[tf]?/u)) {
		return /* #219 */ 'bool';
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

const eatCommand = (stream: StringStream, state: State, base?: boolean): string => {
	const mt = stream.match(/^[a-z](?:[a-z]|-+(?=[a-z]))*/iu) as RegExpMatchArray | null;
	if (base && lyricsCommands.has(mt?.[0])) {
		state.lyrics = true;
	}
	return !mt || 'score' in extData && !extData['score'].has(stream.current()) ? '' : /* #708 */ 'keyword';
};

const lyricsCommands = new Set<string | undefined>(['addlyrics', 'lyricmode', 'lyrics', 'lyricsto']);

const inBase: Tokenizer = (stream, state) => {
	if (stream.eatSpace()) {
		return '';
	}
	const ch = stream.next()!;
	switch (ch) {
		case '-':
			return stream.eat(/[->.+_!^]/u) ? 'operator' : '';
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
			return stream.eat(/[\\=]/u) ? 'punctuation' : eatCommand(stream, state, true);
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
			} else if (/[:|~^]/u.test(ch)) {
				return 'punctuation';
			} else if (/[=',.!?]/u.test(ch)) {
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
				return 'punctuation';
			}
			state.spaced = false;
			return eatCommand(stream, state);
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
			return 'string';
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
