import {isUnderscore} from '@bhsd/cm-util';
import type {ConfigData} from 'wikiparser-node';
import type {MwConfig} from './token';

export const tagModes = {
	onlyinclude: 'mediawiki',
	includeonly: 'mediawiki',
	noinclude: 'mediawiki',
	translate: 'mediawiki',
	tvar: 'mediawiki',
	pre: 'text/pre',
	nowiki: 'text/nowiki',
	indicator: 'mediawiki',
	poem: 'mediawiki',
	ref: 'mediawiki',
	references: 'text/references',
	gallery: 'text/gallery',
	poll: 'mediawiki',
	tabs: 'mediawiki',
	tab: 'mediawiki',
	choose: 'text/choose',
	option: 'mediawiki',
	combobox: 'text/combobox',
	combooption: 'mediawiki',
	inputbox: 'text/inputbox',
};

/**
 * @ignore
 * @test
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
		doubleUnderscore: [d0, d1, d2, d3],
		img,
	}: ConfigData,
	modes: Record<string, string>,
): MwConfig => ({
	tags: Object.fromEntries(ext.map(s => [s, true])),
	tagModes: modes,
	doubleUnderscore: [
		Object.fromEntries(
			(d2 && d0.length === 0 ? Object.keys(d2) : d0).map(s => [isUnderscore(s) ? `__${s}__` : s, true]),
		),
		Object.fromEntries(
			(d3 && d1.length === 0 ? Object.keys(d3) : d1).map(s => [isUnderscore(s) ? `__${s}__` : s, true]),
		),
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
	img: Object.fromEntries(Object.entries(img).map(([k, v]) => [k, `img_${v}`])),
	variants,
	redirection,
});
