import {jsoncLanguage, jsonCompletionSource} from '@bhsd/lezer-json';
import {LanguageSupport} from '@codemirror/language';
import {getMarkPlugin, markLinkBasic} from './util.js';
import type {CodeMirror6} from './codemirror';

export default (_?: unknown, cm?: CodeMirror6): LanguageSupport =>
	new LanguageSupport(jsoncLanguage, [
		jsoncLanguage.data.of({autocomplete: jsonCompletionSource}),
		getMarkPlugin(markLinkBasic(), cm),
	]);
