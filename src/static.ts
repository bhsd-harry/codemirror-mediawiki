import {isUnderscore, getBCP47Variants} from '@bhsd/cm-util';
import type {ConfigData} from 'wikiparser-node';
import type {MwConfig} from './token';

export const tagModes = {
	...Object.fromEntries([
		'onlyinclude',
		'includeonly',
		'noinclude',
		'translate',
		'tvar',
		'indicator',
		'poem',
		'ref',
		'poll',
		'tabs',
		'tab',
		'option',
		'combooption',
		'langconvert',
		'phonos',
	].map(tag => [tag, 'mediawiki'])),
	...Object.fromEntries([
		'pre',
		'nowiki',
		'references',
		'gallery',
		'choose',
		'combobox',
		'inputbox',
		'math',
	].map(tag => [tag, `text/${tag}`])),
	chem: 'text/math',
	ce: 'text/math',
	templatedata: 'json',
	maplink: 'jsonc',
	mapframe: 'jsonc',
	score: 'lilypond',
} as const;

export type MimeTypes = typeof tagModes[keyof typeof tagModes] | 'text/mediawiki';

const getDoubleUnderscore = (newSchema: Record<string, string>): Record<string, string> =>
	Object.fromEntries(Object.entries(newSchema).map(([k, v]) => [isUnderscore(k) ? `__${k}__` : k, v]));

/**
 * @ignore
 */
export const getStaticMwConfig = (
	{
		variable,
		parserFunction: [p0, p1, ...p2],
		protocol,
		nsid,
		functionHook,
		variants,
		redirection,
		ext,
		doubleUnderscore: [,, d2, d3],
		img,
	}: ConfigData,
	modes: Record<string, string>,
): MwConfig => ({
	tags: Object.fromEntries(ext.map(s => [s, true])),
	tagModes: modes,
	doubleUnderscore: [
		getDoubleUnderscore(d2),
		getDoubleUnderscore(d3),
	],
	functionHooks: functionHook,
	variableIDs: variable,
	functionSynonyms: [
		{
			...p0,
			...Object.fromEntries(p2.flat().map(s => [s, s])),
		},
		{...p1},
	],
	urlProtocols: `${protocol}|//`,
	nsid,
	imageKeywords: img,
	variants: getBCP47Variants(variants),
	redirection,
});
