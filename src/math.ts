import {extCompletion, extData} from './constants.js';
import {getCompletions} from './util.js';
import type {StreamParser} from '@codemirror/language';

let mathFetch: Promise<void> | undefined;

export const math: StreamParser<object> = {
	startState() {
		if (typeof wikiparse === 'object') {
			mathFetch ??= (async () => {
				const data: string[] = await (await fetch(`${wikiparse.CDN}/data/ext/math.json`)).json();
				extData['math'] = new Set(data);
				extCompletion['math'] = getCompletions(data);
			})();
		}
		return {};
	},

	token(stream): string {
		if (stream.eatSpace()) {
			return '';
		}
		const ch = stream.next()!;
		switch (ch) {
			case '\\':
				if (stream.eatWhile(/[a-z]/iu)) {
					return 'math' in extData && !extData['math'].has(stream.current()) ? '' : /* #708 */ 'keyword';
				} else if (stream.eat(/[,;!\\]/u)) {
					return /* #708 */ 'keyword';
				}
				return stream.eat(/[$&%#{}_]/u) ? /* #219 */ 'atom' : /* #f00 */ 'invalid';
			case '^':
			case '_':
			case '&':
				return 'operator';
			case '{':
			case '}':
				return 'brace';
			case '[':
			case ']':
				return 'squareBracket';
			case '(':
			case ')':
				return 'paren';
			case '.':
				return stream.eatWhile(/\d/u) ? /* #164 */ 'number' : '';
			default:
				if (/\d/u.test(ch)) {
					stream.match(/\d*(?:\.\d*)?/u);
					return /* #164 */ 'number';
				} else if (/[a-z]/iu.test(ch)) {
					stream.eatWhile(/[a-z]/iu);
					return /* #256 */ 'variableName.special';
				}
				stream.eatWhile(/[^\\^&{}[\]().\w]/u);
				return '';
		}
	},
};
