import {
	keymap,
} from '@codemirror/view';
import {
	autocompletion,
} from '@codemirror/autocomplete';
import {LanguageSupport} from '@codemirror/language';
import bidiIsolates from './bidi.js';
import closeTags from './closeTags.js';
import {
	wikilint,
} from './codemirror.js';
import mediawikiColorPicker from './color.js';
import escapeKeymap from './escape.js';
import codeFolding from './fold.js';
import magicWordHover from './hover.js';
import inlayHints from './inlay.js';
import formatKeymap from './keymap.js';
import bracketMatchingBase from './matchBrackets.js';
import tagMatchingState from './matchTag.js';
import {mediawikiBase} from './mediawiki.js';
import {
	openLinks,
} from './openLinks.js';
import refHover from './ref.js';
import signatureHelpBase from './signature.js';
import {tagModes, getStaticMwConfig} from './static.js';
import {updateCDN} from './util.js';
import type {Extension} from '@codemirror/state';
import type {
	Language,
} from '@codemirror/language';
import type {ConfigData} from 'wikiparser-node';

/**
 * Get the [hover](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#hover)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://fastly.jsdelivr.net`
 */
export const hover = (configData: ConfigData, cdn?: string): Extension => [
	magicWordHover(
		configData,
		cdn,
	),
];

/**
 * Get the [signatureHelp](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#signaturehelp)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://fastly.jsdelivr.net`
 */
export const signatureHelp = (configData: ConfigData, cdn?: string): Extension => [
	signatureHelpBase(
		configData,
		cdn,
	),
];

/**
 * Get the [bracketMatching](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#bracketmatching)
 * extension for Wikitext.
 */
export const bracketMatching = (): Extension =>
	[
		bracketMatchingBase(
			{brackets: '()[]{}（）【】［］｛｝'},
		),
		tagMatchingState,
	];

/**
 * Get the stream [language](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#mediawikilanguage)
 * for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 */
export const mediawikiLanguage = (configData: ConfigData): Language =>
	mediawikiBase(
		getStaticMwConfig(configData, tagModes),
	);

/**
 * Get full language support for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://fastly.jsdelivr.net`
 */
export const mediawiki = (configData: ConfigData, cdn?: string): LanguageSupport => {
	updateCDN(cdn);
	return new LanguageSupport(
		mediawikiLanguage(configData),
		[
			wikiTheme,
			keymap.of([
				...formatKeymap,
				...escapeKeymap(configData),
			]),
			bracketMatching(),
			autocompletion(),
			closeTags(),
			refHover(configData),
			magicWordHover(configData),
			signatureHelpBase(configData),
			inlayHints(configData),
			mediawikiColorPicker(),
			codeFolding(),
			openLinks(configData),
			wikilint(configData),
		],
	);
};

export {
	escapeKeymap,
	bidiIsolates, // eslint-disable-line unicorn/prefer-export-from
	refHover,
	inlayHints,
	formatKeymap,
	mediawikiColorPicker as colorPicker,
	codeFolding,
	openLinks,
	closeTags,
};
