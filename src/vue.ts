import {vue} from '@codemirror/lang-vue';
import {htmlLanguage, htmlCompletionSource} from '@codemirror/lang-html';
import {javascript} from '@codemirror/lang-javascript';
import {LanguageSupport} from '@codemirror/language';
import {cssCompletion} from './css';
import {jsCompletion} from './javascript';

export default (): LanguageSupport => vue({
	base: new LanguageSupport(htmlLanguage, [
		htmlLanguage.data.of({autocomplete: htmlCompletionSource}),
		javascript().support,
		jsCompletion,
		cssCompletion(),
	]),
});
