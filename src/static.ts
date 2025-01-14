import type {Config} from 'wikiparser-node';
import type {MwConfig} from './token';

export const tagModes = {
	onlyinclude: 'mediawiki',
	includeonly: 'mediawiki',
	noinclude: 'mediawiki',
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
	templatedata: 'json',
	mapframe: 'json',
	maplink: 'json',
	graph: 'json',
};

export const getStaticMwConfig = (
	{
		variable,
		parserFunction: [p0, p1, ...p2],
		protocol,
		nsid,
		variants,
		redirection,
		ext,
		doubleUnderscore: [d0, d1, d2, d3],
		img,
	}: Config,
	modes: Record<string, string>,
): MwConfig => ({
	tags: Object.fromEntries(ext.map(s => [s, true])),
	tagModes: modes,
	doubleUnderscore: [
		Object.fromEntries((d2 && d0.length === 0 ? Object.keys(d2) : d0).map(s => [`__${s}__`, true])),
		Object.fromEntries((d3 && d1.length === 0 ? Object.keys(d3) : d1).map(s => [`__${s}__`, true])),
	],
	variableIDs: variable,
	functionSynonyms: [
		{
			...p0,
			...Object.fromEntries(p2.flat().map(s => [s, s])),
		},
		Array.isArray(p1) ? Object.fromEntries(p1.map(s => [s, s.toLowerCase()])) : {...p1},
	],
	urlProtocols: `${protocol}|//`,
	nsid,
	img: Object.fromEntries(Object.entries(img).map(([k, v]) => [k, `img_${v}`])),
	variants,
	redirection,
});
