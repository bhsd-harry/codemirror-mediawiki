import type {Config} from 'wikiparser-node';
import type {MwConfig} from './mediawiki';

export const tagModes = {
	onlyinclude: 'mediawiki',
	includeonly: 'mediawiki',
	noinclude: 'mediawiki',
	tab: 'mediawiki',
	tabs: 'mediawiki',
	indicator: 'mediawiki',
	poem: 'mediawiki',
	ref: 'mediawiki',
	references: 'mediawiki',
	option: 'mediawiki',
	choose: 'mediawiki',
	combooption: 'mediawiki',
	combobox: 'mediawiki',
	poll: 'mediawiki',
	gallery: 'mediawiki',
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

export const getStaticMwConfig = (config: Config): MwConfig => {
	const mwConfig: MwConfig = {
		tags: {},
		tagModes,
		doubleUnderscore: [{}, {}],
		functionSynonyms: [config.parserFunction[0], {}],
		urlProtocols: `${config.protocol}|//`,
		nsid: config.nsid,
		img: {},
		variants: config.variants,
		redirection: config.redirection,
	};
	fromEntries(config.ext, mwConfig.tags);
	fromEntries(config.doubleUnderscore[0].map(s => `__${s}__`), mwConfig.doubleUnderscore[0]);
	fromEntries(config.doubleUnderscore[1].map(s => `__${s}__`), mwConfig.doubleUnderscore[1]);
	fromEntries((config.parserFunction.slice(2) as string[][]).flat(), mwConfig.functionSynonyms[0], true);
	fromEntries(config.parserFunction[1], mwConfig.functionSynonyms[1]);
	for (const [key, val] of Object.entries(config.img)) {
		mwConfig.img![key] = `img_${val}`;
	}
	return mwConfig;
};
