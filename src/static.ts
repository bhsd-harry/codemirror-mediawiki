import type {JsonConfig} from 'wikiparser-node';
import type {MwConfig} from './token';

export const tagModes = {
	onlyinclude: 'mediawiki',
	includeonly: 'mediawiki',
	noinclude: 'mediawiki',
	pre: 'text/nowiki',
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
 * Object.fromEntries polyfill
 * @param entries
 * @param obj
 * @param string 是否为字符串
 */
const fromEntries = (entries: readonly string[], obj: Record<string, unknown>, string?: boolean): void => {
	for (const entry of entries) {
		obj[entry] = string ? entry : true;
	}
};

export const getStaticMwConfig = (
	{parserFunction, protocol, nsid, variants, redirection, ext, doubleUnderscore, img}: JsonConfig,
): MwConfig => {
	const mwConfig: MwConfig = {
			tags: {},
			tagModes,
			doubleUnderscore: [{}, {}],
			functionSynonyms: [parserFunction[0], {}],
			urlProtocols: `${protocol}|//`,
			nsid,
			img: {},
			variants,
			redirection,
		},
		[insensitive] = doubleUnderscore;
	fromEntries(ext, mwConfig.tags);
	fromEntries(
		(Array.isArray(insensitive) ? insensitive : Object.keys(insensitive)).map(s => `__${s}__`),
		mwConfig.doubleUnderscore[0],
	);
	fromEntries(doubleUnderscore[1].map(s => `__${s}__`), mwConfig.doubleUnderscore[1]);
	fromEntries((parserFunction.slice(2) as string[][]).flat(), mwConfig.functionSynonyms[0], true);
	fromEntries(parserFunction[1], mwConfig.functionSynonyms[1]);
	for (const [key, val] of Object.entries(img)) {
		mwConfig.img![key] = `img_${val}`;
	}
	return mwConfig;
};
