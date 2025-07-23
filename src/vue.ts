import {vue} from '@codemirror/lang-vue';
import {htmlLanguage, htmlCompletionSource} from '@codemirror/lang-html';
import {javascript} from '@codemirror/lang-javascript';
import {LanguageSupport} from '@codemirror/language';
import {jsCompletion} from './javascript';
import css from './css';

export default (): LanguageSupport => vue({
	base: new LanguageSupport(htmlLanguage, [
		htmlLanguage.data.of({autocomplete: htmlCompletionSource}),
		javascript().support,
		jsCompletion,
		css(undefined).support,
	]),
});
