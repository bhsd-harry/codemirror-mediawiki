import type {StreamParser, StringStream} from '@codemirror/language';

declare interface State {
	tokenize: Tokenizer;
	wb: boolean;
}
declare type Tokenizer = (stream: StringStream, state: State) => string;

const tokenNumber: Tokenizer = (stream, state) => {
	if (stream.match(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?/iu)) {
		state.wb = false;
		return /* #164 */ 'number';
	}
	state.wb = true;
	return '';
};

const mkJson = (jsoncMode?: boolean): StreamParser<State> => {
	// Tokenizer

	const tokenComment: Tokenizer = (stream, state) => {
		if (stream.skipTo('*/')) {
			stream.next();
			stream.next();
			state.tokenize = tokenBase;
		} else {
			stream.skipToEnd();
		}
		return /* #940 */ 'comment';
	};

	const tokenBase: Tokenizer = (stream, state) => {
		if (stream.eatSpace()) {
			state.wb = true;
			return '';
		}
		const ch = stream.next()!;
		switch (ch) {
			case '{':
			case '}':
				state.wb = true;
				return 'brace';
			case '[':
			case ']':
				state.wb = true;
				return 'squareBracket';
			case ':':
			case ',':
				state.wb = true;
				return 'separator';
			case '/':
				state.wb = true;
				if (jsoncMode) {
					if (stream.eat('/')) {
						stream.skipToEnd();
						return /* #940 */ 'comment';
					} else if (stream.eat('*')) {
						state.tokenize = tokenComment;
						return tokenComment(stream, state);
					}
				}
				return '';
			case '"': {
				state.wb = true;
				let escaped = false,
					next = stream.next();
				while (next) {
					if (!escaped && next === '"') {
						break;
					}
					escaped = !escaped && next === '\\';
					next = stream.next();
				}
				return stream.match(/^\s*:/u, false)
					? /* #00c */ 'propertyName.definition'
					: /* #a11 */ 'string';
			}
			case '-':
				if (state.wb) {
					return tokenNumber(stream, state);
				}
				state.wb = true;
				return '';
			default:
				if (state.wb) {
					if (ch >= '0' && ch <= '9') {
						stream.backUp(1);
						return tokenNumber(stream, state);
					} else if (ch === 'n' && stream.match(/^ull\b/u)) {
						state.wb = false;
						return /* #708 */ 'null';
					} else if (
						ch === 't' && stream.match(/^rue\b/u)
						|| ch === 'f' && stream.match(/^alse\b/u)
					) {
						state.wb = false;
						return /* #219 */ 'bool';
					}
				}
				state.wb = !/[\w$]/u.test(ch);
				return '';
		}
	};

	// Interface

	return {
		startState(): State {
			return {
				tokenize: tokenBase,
				wb: true,
			};
		},

		token(stream, state): string {
			if (stream.sol()) {
				state.wb = true;
			}
			return state.tokenize(stream, state);
		},
	};
};

export const jsonBasic = mkJson(),
	jsonc = mkJson(true);
