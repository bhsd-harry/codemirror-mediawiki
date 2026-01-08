import {
	keymap,
} from '@codemirror/view';
import {
	autocompletion,
} from '@codemirror/autocomplete';
import {LanguageSupport} from '@codemirror/language';
import {linter, lintGutter, lintKeymap} from '@codemirror/lint';
import elt from 'crelt';
import mediawikiColorPicker from './color.js';
import {diagnosticSelector} from './constants.js';
import escapeKeymap from './escape.js';
import codeFolding from './fold.js';
import magicWordHover from './hover.js';
import inlayHints from './inlay.js';
import formatKeymap from './keymap.js';
import {
	getWikiLintSource,
} from './lintsource.js';
import bracketMatchingBase from './matchBrackets.js';
import tagMatchingState from './matchTag.js';
import {mediawikiBase} from './mediawiki.js';
import refHover from './ref.js';
import signatureHelp from './signature.js';
import {tagModes, getStaticMwConfig} from './static.js';
import {updateCDN} from './util.js';
import type {Extension} from '@codemirror/state';
import type {
	Language,
} from '@codemirror/language';
import type {Diagnostic} from '@codemirror/lint';
import type {ConfigData, LintConfig} from 'wikiparser-node';

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
 * Get the [wikilint](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#wikilint)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param lintConfig [Lint configuration](https://github.com/bhsd-harry/wikiparser-node/wiki/Rules#configuration).
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://testingcf.jsdelivr.net`
 */
export const wikilint = (configData: ConfigData, lintConfig?: LintConfig, cdn?: string): Extension => {
	updateCDN(cdn);
	const source = getWikiLintSource(configData, lintConfig);
	return [
		linter(async v => {
			const diagnostics = (await (await source)(v)).map((diagnostic): Diagnostic => ({
				...diagnostic,
				renderMessage(view): HTMLElement {
					const span = elt(
						'span',
						{class: diagnosticSelector.slice(1)},
						diagnostic.message,
					);
					span.addEventListener('click', () => {
						view.dispatch({
							selection: {anchor: diagnostic.from, head: diagnostic.to},
						});
						view.focus();
					});
					return span;
				},
			}));
			if (v.state.readOnly) {
				for (const diagnostic of diagnostics) {
					delete diagnostic.actions;
				}
			}
			return diagnostics;
		}),
		lintGutter(),
		keymap.of(lintKeymap),
	];
};

/**
 * Get full language support for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://testingcf.jsdelivr.net`
 */
export const mediawiki = (configData: ConfigData, cdn?: string): LanguageSupport => {
	updateCDN(cdn);
	return new LanguageSupport(
		mediawikiLanguage(configData),
		[
			keymap.of([
				...formatKeymap,
				...escapeKeymap(configData),
			]),
			bracketMatching(),
			autocompletion(),
			refHover(configData),
			magicWordHover(configData),
			signatureHelp(configData),
			inlayHints(configData),
			mediawikiColorPicker(),
			codeFolding(),
			wikilint(configData),
		],
	);
};

export {
	escapeKeymap,
	refHover,
	magicWordHover as hover,
	signatureHelp,
	inlayHints,
	formatKeymap,
	mediawikiColorPicker as colorPicker,
	codeFolding,
};
