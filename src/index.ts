import {LanguageSupport} from '@codemirror/language';
import {autocompletion} from '@codemirror/autocomplete';
import {keymap} from '@codemirror/view';
import {tagModes, getStaticMwConfig} from './static.js';
import {mediawiki as mediawikiBase} from './mediawiki.js';
import bracketMatchingBase from './matchBrackets.js';
import tagMatchingState from './matchTag.js';
import escapeKeymap from './escape.js';
import refHover from './ref.js';
import hover from './hover.js';
import signatureHelp from './signature.js';
import inlayHints from './inlay.js';
import formatKeymap from './keymap';
import colorPicker from './color.js';
import codeFolding from './fold.js';
import type {Extension} from '@codemirror/state';
import type {Language} from '@codemirror/language';
import type {ConfigData} from 'wikiparser-node';

/**
 * Get the stream [language](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#mediawikilanguage)
 * for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 */
export const mediawikiLanguage = (configData: ConfigData): Language =>
	mediawikiBase(getStaticMwConfig(configData, tagModes));

/**
 * Get the [bracketMatching](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#bracketmatching)
 * extension for Wikitext.
 */
export const bracketMatching = (): Extension =>
	[bracketMatchingBase({brackets: '()[]{}（）【】［］｛｝'}), tagMatchingState];

/**
 * Get full language support for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 */
export const mediawiki = (configData: ConfigData): LanguageSupport => new LanguageSupport(
	mediawikiLanguage(configData),
	[
		keymap.of([
			...formatKeymap,
			...escapeKeymap(configData),
		]),
		bracketMatching(),
		autocompletion(),
		refHover(configData),
		hover(configData),
		signatureHelp(configData),
		inlayHints(configData),
		colorPicker(),
		codeFolding(),
	],
);

export {
	escapeKeymap,
	refHover,
	hover,
	signatureHelp,
	inlayHints,
	formatKeymap,
	colorPicker,
	codeFolding,
};
