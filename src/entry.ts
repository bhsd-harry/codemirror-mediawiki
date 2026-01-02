import {LanguageSupport} from '@codemirror/language';
import {tagModes, getStaticMwConfig} from './static';
import {mediawiki as mediawikiBase} from './mediawiki';
import bracketMatchingBase from './matchBrackets';
import tagMatchingState from './matchTag';
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
	[bracketMatching()],
);
