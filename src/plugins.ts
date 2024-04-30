import {javascript as js, javascriptLanguage, scopeCompletionSource} from '@codemirror/lang-javascript';
import type {Extension} from '@codemirror/state';
export {css as cssLR} from '@codemirror/lang-css';
export {json as jsonLR} from '@codemirror/lang-json';
export {css} from '@codemirror/legacy-modes/mode/css';
export {javascript} from '@codemirror/legacy-modes/mode/javascript';
export {lua} from '@codemirror/legacy-modes/mode/lua';

export const javascriptLR = (): Extension => [
	js(),
	javascriptLanguage.data.of({autocomplete: scopeCompletionSource(window)}),
];
