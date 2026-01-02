import {LanguageSupport} from '@codemirror/language';
import {autocompletion} from '@codemirror/autocomplete';
import {tagModes, getStaticMwConfig} from './static.js';
import {mediawiki as mediawikiBase} from './mediawiki.js';
import bracketMatchingBase from './matchBrackets.js';
import tagMatchingState from './matchTag.js';
import type {Extension} from '@codemirror/state';
import type {Language} from '@codemirror/language';
import type {ConfigData} from 'wikiparser-node';

/**
 * Get the stream language for Wikitext.
 * @param configData WikiParser-Node configuration data.
 */
export const mediawikiLanguage = (configData: ConfigData): Language =>
	mediawikiBase(getStaticMwConfig(configData, tagModes));

export const bracketMatching = (): Extension =>
	[bracketMatchingBase({brackets: '()[]{}（）【】［］｛｝'}), tagMatchingState];

/**
 * Get LanguageSupport for the MediaWiki mode.
 * @param configData WikiParser-Node configuration data.
 */
export const mediawiki = (configData: ConfigData): LanguageSupport => new LanguageSupport(
	mediawikiLanguage(configData),
	[
		bracketMatching(),
		autocompletion(),
	],
);
