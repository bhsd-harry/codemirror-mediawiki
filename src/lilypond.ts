import type {StreamParser, StringStream} from '@codemirror/language';

declare interface State {
	tokenize: Tokenizer;
	parens: number;
}
declare type Tokenizer = (stream: StringStream, state: State) => string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const inComment = <T extends (stream: StringStream, state: any) => string = Tokenizer>(
	parent: T,
	end: string,
): T => ((stream: StringStream, state: State) => {
	if (stream.skipTo(end)) {
		stream.next();
		stream.next();
		state.tokenize = parent;
	} else {
		stream.skipToEnd();
	}
	return /* #940 */ 'comment';
}) as T;

/**
 * @ignore
 * @todo lyrics are also strings
 */
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

const inScheme: Tokenizer = (stream, state) => {
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
				state.tokenize = inBase;
				return 'separator';
			}
			return '';
		case '"':
			state.tokenize = inString(inScheme);
			return /* #a11 */ 'string';
		case ';':
			stream.skipToEnd();
			return /* #940 */ 'comment';
		case '#':
			if (stream.eat('!')) {
				state.tokenize = inComment(inScheme, '!#');
				return /* #940 */ 'comment';
			}
			// fall through
		default:
			return '';
	}
};

const inBase: Tokenizer = (stream, state) => {
	if (stream.eatSpace()) {
		return '';
	}
	const ch = stream.next()!;
	switch (ch) {
		case '-':
			return stream.eat(/[->.+_!^]/u) ? 'operator' : '';
		case '#':
			if (stream.eat('#')) {
				return 'operator';
			}
			// fall through
		case '$':
			if (stream.eat('(')) {
				state.tokenize = inScheme;
				state.parens = 1;
				return 'separator';
			}
			return '';
		case '"':
			state.tokenize = inString(inBase);
			return /* #a11 */ 'string';
		case '%':
			if (stream.eat('{')) {
				state.tokenize = inComment(inBase, '%}');
				return /* #940 */ 'comment';
			}
			stream.skipToEnd();
			return /* #940 */ 'comment';
		case '\\':
			if (stream.eat(/[<>!]/u)) {
				return 'operator';
			} else if (stream.eat('\\')) {
				return 'punctuation';
			}
			return stream.match(/^[a-z](?:[a-z]|-+(?=[a-z]))*/iu) ? /* #708 */ 'keyword' : '';
		default:
			if (/[{}<>()[\]]/u.test(ch)) {
				return 'squareBracket';
			} else if (/[:|~^]/u.test(ch)) {
				return 'punctuation';
			} else if (/[=',.!?]/u.test(ch)) {
				return 'operator';
			} else if (/\d/u.test(ch)) {
				stream.match(/^\d*(?:[./]\d+)?/u);
				return /* #164 */ 'number';
			} else if (/[a-z]/iu.test(ch)) {
				const mt = stream.match(/^(?:[a-z]|[-_\d]+(?=[a-z]))+/iu) as RegExpMatchArray | null,
					word = ch + (mt?.[0] ?? '');
				return /^(?:[rs]|[a-g](?:i[sh])*|[a-dfg]?(?:e[sh])+)$/u.test(word) ? '' : /* #219 */ 'atom';
			}
			return '';
	}
};

export const lilypond: StreamParser<State> = {
	startState() {
		return {
			tokenize: inBase,
			parens: 0,
		};
	},

	token(stream, state): string {
		return state.tokenize(stream, state);
	},
};
