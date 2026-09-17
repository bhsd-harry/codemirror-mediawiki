import {vue} from '@codemirror/lang-vue';
import {htmlLanguage, htmlCompletionSource} from '@codemirror/lang-html';
import {LanguageSupport} from '@codemirror/language';
import {getCommonSupport} from './html.js';
import type {CodeMirror6} from './codemirror';

export default (_?: unknown, cm?: CodeMirror6): LanguageSupport => vue({
	base: new LanguageSupport(htmlLanguage, [
		htmlLanguage.data.of({autocomplete: htmlCompletionSource}),
		getCommonSupport(cm),
	]),
});
