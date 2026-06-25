import {isUnderscore, getBCP47Variants} from '@bhsd/cm-util';
import type {ConfigData} from 'wikiparser-node';
import type {MwConfig} from './token';

export const tagModes = {
	onlyinclude: 'mediawiki',
	includeonly: 'mediawiki',
	noinclude: 'mediawiki',
	translate: 'mediawiki',
	tvar: 'mediawiki',
	indicator: 'mediawiki',
	poem: 'mediawiki',
	ref: 'mediawiki',
	poll: 'mediawiki',
	tabs: 'mediawiki',
	tab: 'mediawiki',
	option: 'mediawiki',
	combooption: 'mediawiki',
	langconvert: 'mediawiki',
	phonos: 'mediawiki',
	pre: 'text/pre',
	nowiki: 'text/nowiki',
	references: 'text/references',
	gallery: 'text/gallery',
	choose: 'text/choose',
	combobox: 'text/combobox',
	inputbox: 'text/inputbox',
	templatedata: 'json',
	maplink: 'jsonc',
	mapframe: 'jsonc',
	math: 'text/math',
	chem: 'text/math',
	ce: 'text/math',
	score: 'lilypond',
};

const getDoubleUnderscore = (newSchema: Record<string, string>): Record<string, string> =>
	Object.fromEntries(Object.entries(newSchema).map(([k, v]) => [isUnderscore(k) ? `__${k}__` : k, v]));

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
