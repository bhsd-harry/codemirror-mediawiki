import {configureNesting} from '@lezer/html';
import {htmlLanguage, htmlCompletionSourceWith} from '@codemirror/lang-html';
import {javascript, javascriptLanguage} from '@codemirror/lang-javascript';
import {cssLanguage} from '@codemirror/lang-css';
import {LanguageSupport, syntaxHighlighting, defaultHighlightStyle, HighlightStyle} from '@codemirror/language';
import {cssCompletion} from './css.js';
import {jsCompletion} from './javascript.js';
import {mediawikiBase} from './mediawiki.js';
import type {MwConfig} from './token';

export default (config: MwConfig): LanguageSupport => {
	const {language, support} = mediawikiBase(config),
		lang = new LanguageSupport(
			htmlLanguage.configure({
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
				htmlLanguage.data.of({
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
				syntaxHighlighting(
					HighlightStyle.define(defaultHighlightStyle.specs, {themeType: 'light'}),
				),
			],
		);
	Object.assign(lang, {nestedMWLanguage: language});
	return lang;
};
