import {vue} from '@codemirror/lang-vue';
import {htmlLanguage, htmlCompletionSource} from '@codemirror/lang-html';
import {javascript} from '@codemirror/lang-javascript';
import {LanguageSupport} from '@codemirror/language';
import {cssCompletion} from './css.js';
import {jsCompletion, markGlobalsAndDocTagPlugin} from './javascript.js';
import type {CodeMirror6} from './codemirror';

export default (_?: unknown, cm?: CodeMirror6): LanguageSupport => vue({
	base: new LanguageSupport(htmlLanguage, [
		htmlLanguage.data.of({autocomplete: htmlCompletionSource}),
		javascript().support,
		jsCompletion,
		cssCompletion(),
		markGlobalsAndDocTagPlugin(cm),
	]),
});
