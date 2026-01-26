import {configureNesting} from '@lezer/html';
import {htmlLanguage, htmlCompletionSourceWith} from '@codemirror/lang-html';
import {javascript, javascriptLanguage} from '@codemirror/lang-javascript';
import {cssLanguage} from '@codemirror/lang-css';
import {LanguageSupport} from '@codemirror/language';
import {cssCompletion} from './css.js';
import {jsCompletion} from './javascript.js';
import {mediawikiBase} from './mediawiki.js';
import {getLightHighlightStyle} from './theme.js';
import type {MwConfig} from './token';

export default (config: MwConfig): LanguageSupport => {
	const {language, support} = mediawikiBase(config),
		/** @test */
		lang = htmlLanguage.configure({
			wrap: configureNesting(
				[
					{tag: 'script', parser: javascriptLanguage.parser},
					{tag: 'style', parser: cssLanguage.parser},
					{tag: 'noinclude', parser: language.parser},
				],
				[{name: 'style', parser: cssLanguage.parser.configure({top: 'Styles'})}],
			),
		}),
		/** @test */
		autocomplete = htmlLanguage.data.of({
			autocomplete: htmlCompletionSourceWith({
				extraTags: {
					noinclude: {globalAttrs: false},
				},
			}),
		}),
		langSupport = new LanguageSupport(
			lang,
			[
				autocomplete,
				javascript().support,
				jsCompletion,
				cssCompletion(),
				support,
				getLightHighlightStyle(),
			],
		);
	Object.assign(langSupport, {nestedMWLanguage: language});
	return langSupport;
};
