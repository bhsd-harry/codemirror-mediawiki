import {javascript as js, javascriptLanguage, scopeCompletionSource} from '@codemirror/lang-javascript';
import type {Extension} from '@codemirror/state';

export default (): Extension => [
	js(),
	javascriptLanguage.data.of({autocomplete: scopeCompletionSource(globalThis)}),
];
