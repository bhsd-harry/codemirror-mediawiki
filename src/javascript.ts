import {javascript as js, javascriptLanguage, scopeCompletionSource} from '@codemirror/lang-javascript';
import type {Extension} from '@codemirror/state';

export const jsCompletion = javascriptLanguage.data.of({autocomplete: scopeCompletionSource(globalThis)});

export default (): Extension => [js(), jsCompletion];
