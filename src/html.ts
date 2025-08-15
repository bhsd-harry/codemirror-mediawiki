import {configureNesting} from '@lezer/html';
import {htmlPlain, htmlCompletionSourceWith} from '@codemirror/lang-html';
import {javascript, javascriptLanguage} from '@codemirror/lang-javascript';
import {cssLanguage} from '@codemirror/lang-css';
import {LanguageSupport} from '@codemirror/language';
import {jsCompletion} from './javascript';
import {mediawiki} from './mediawiki';
import {cssCompletion} from './css';
import type {MwConfig} from './token';

export default (config: MwConfig): LanguageSupport => {
	const {language, support} = mediawiki(config),
		lang = new LanguageSupport(
			htmlPlain.configure({
				wrap: configureNesting(
					[
						{tag: 'script', parser: javascriptLanguage.parser},
						{tag: 'style', parser: cssLanguage.parser},
						{tag: 'noinclude', parser: language.parser},
					],
					[{name: 'style', parser: cssLanguage.parser.configure({top: 'Styles'})}],
				),
			}),
			[
				htmlPlain.data.of({
					autocomplete: htmlCompletionSourceWith({
						extraTags: {
							noinclude: {globalAttrs: false},
						},
					}),
				}),
				javascript().support,
				jsCompletion,
				cssCompletion(),
				support,
			],
		);
	Object.assign(lang, {nestedMWLanguage: language});
	return lang;
};
