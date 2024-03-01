import {setObject, getObject} from './msg';
import type {Config} from 'wikiparser-node';
import type {MwConfig} from '../src/mediawiki';

declare interface MagicWord {
	name: string;
	aliases: string[];
	'case-sensitive': boolean;
}

// 和本地缓存有关的常数
const USING_LOCAL = mw.loader.getState('ext.CodeMirror') !== null,
	DATA_MODULE = mw.loader.getState('ext.CodeMirror.data') ? 'ext.CodeMirror.data' : 'ext.CodeMirror',
	ALL_SETTINGS_CACHE: Record<string, {time: number, config: MwConfig}>
		= getObject('InPageEditMwConfig') || {},
	SITE_ID = `${mw.config.get('wgServerName')}${mw.config.get('wgScriptPath')}`,
	SITE_SETTINGS = ALL_SETTINGS_CACHE[SITE_ID],
	VALID = Number(SITE_SETTINGS?.time) > Date.now() - 86_400 * 1000 * 30;

/**
 * 将魔术字信息转换为CodeMirror接受的设置
 * @param magicWords 完整魔术字列表
 * @param rule 过滤函数
 * @param flip 是否反向筛选对大小写敏感的魔术字
 */
const getConfig = (
	magicWords: MagicWord[],
	rule: (word: MagicWord) => boolean,
	flip?: boolean,
): Record<string, string> => {
	const words = magicWords.filter(rule).filter(({'case-sensitive': i}) => i !== flip)
			.flatMap(({aliases, name, 'case-sensitive': i}) => aliases.map(alias => ({
				alias: (i ? alias : alias.toLowerCase()).replace(/:$/u, ''),
				name,
			}))),
		obj: Record<string, string> = {};
	for (const {alias, name} of words) {
		obj[alias] = name;
	}
	return obj;
};

/**
 * 将魔术字信息转换为CodeMirror接受的设置
 * @param magicWords 完整魔术字列表
 * @param rule 过滤函数
 */
const getConfigPair = (
	magicWords: MagicWord[],
	rule: (word: MagicWord) => boolean,
): [Record<string, string>, Record<string, string>] => [true, false]
	.map(bool => getConfig(magicWords, rule, bool)) as [Record<string, string>, Record<string, string>];

/**
 * 将设置保存到mw.config
 * @param config 设置
 */
const setConfig = (config: MwConfig): void => {
	mw.config.set('extCodeMirrorConfig', config);
};

/** 加载CodeMirror的mediawiki模块需要的设置 */
export const getMwConfig = async (): Promise<MwConfig> => {
	if (USING_LOCAL && !VALID) { // 只在localStorage过期时才会重新加载ext.CodeMirror.data
		await mw.loader.using(DATA_MODULE);
	}

	let config = mw.config.get('extCodeMirrorConfig') as MwConfig | null;
	if (!config && VALID) {
		({config} = SITE_SETTINGS!);
		setConfig(config);
	}
	const isIPE = config && Object.values(config.functionSynonyms[0]).includes(true as unknown as string);
	// 情形1：config已更新，可能来自localStorage
	if (config?.img && config.variants && !isIPE) {
		return {
			...config,
			nsid: mw.config.get('wgNamespaceIds'),
		};
	}

	// 以下情形均需要发送API请求
	// 情形2：localStorage未过期但不包含新设置
	// 情形3：新加载的 ext.CodeMirror.data
	// 情形4：`config === null`
	await mw.loader.using('mediawiki.api');
	const {
		query: {general: {variants}, magicwords, extensiontags, functionhooks, variables},
	}: {
		query: {
			general: {variants?: {code: string}[]};
			magicwords: MagicWord[];
			extensiontags: string[];
			functionhooks: string[];
			variables: string[];
		};
	} = await new mw.Api().get({
		meta: 'siteinfo',
		siprop: [
			'general',
			'magicwords',
			...config && !isIPE ? [] : ['extensiontags', 'functionhooks', 'variables'],
		],
		formatversion: '2',
	}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
	const others = new Set(['msg', 'raw', 'msgnw', 'subst', 'safesubst']);

	// 先处理魔术字和状态开关
	if (config && !isIPE) { // 情形2或3
		const {functionSynonyms: [insensitive]} = config;
		if (!('subst' in insensitive)) {
			Object.assign(insensitive, getConfig(magicwords, ({name}) => others.has(name)));
		}
	} else { // 情形4：`config === null`
		// @ts-expect-error incomplete properties
		config = {
			tagModes: {
				tab: 'text/mediawiki',
				indicator: 'text/mediawiki',
				poem: 'text/mediawiki',
				ref: 'text/mediawiki',
				option: 'text/mediawiki',
				combooption: 'text/mediawiki',
				tabs: 'text/mediawiki',
				poll: 'text/mediawiki',
				gallery: 'text/mediawiki',
			},
			tags: {},
			urlProtocols: mw.config.get('wgUrlProtocols'),
		};
		for (const tag of extensiontags) {
			config!.tags[tag.slice(1, -1)] = true;
		}
		const functions = new Set([
			...functionhooks,
			...variables,
			...others,
		]);
		config!.functionSynonyms = getConfigPair(magicwords, ({name}) => functions.has(name));
		config!.doubleUnderscore = getConfigPair(
			magicwords,
			({aliases}) => aliases.some(alias => /^__.+__$/u.test(alias)),
		);
		config!.fromApi = true;
	}
	config!.img = getConfig(magicwords, ({name}) => name.startsWith('img_'));
	config!.variants = variants ? variants.map(({code}) => code) : [];
	config!.nsid = mw.config.get('wgNamespaceIds');
	setConfig(config!);
	ALL_SETTINGS_CACHE[SITE_ID] = {config: config!, time: Date.now()};
	setObject('InPageEditMwConfig', ALL_SETTINGS_CACHE);
	return config!;
};

/**
 * 将MwConfig转换为Config
 * @param minConfig 基础Config
 * @param mwConfig
 */
export const getParserConfig = (minConfig: Config, mwConfig: MwConfig): Config => {
	if (mw.config.exists('wikilintConfig')) {
		return mw.config.get('wikilintConfig') as Config;
	}
	const config: Config = {
		...minConfig,
		ext: Object.keys(mwConfig.tags),
		namespaces: mw.config.get('wgFormattedNamespaces'),
		nsid: mwConfig.nsid,
		doubleUnderscore: mwConfig.doubleUnderscore.map(
			obj => Object.keys(obj).map(s => s.slice(2, -2)),
		) as [string[], string[]],
		variants: mwConfig.variants!,
		protocol: mwConfig.urlProtocols.replace(/\\:/gu, ':'),
	};
	[config.parserFunction[0]] = mwConfig.functionSynonyms;
	if (!USING_LOCAL) {
		for (const [key, val] of Object.entries(mwConfig.functionSynonyms[0])) {
			if (!key.startsWith('#')) {
				config.parserFunction[0][`#${key}`] = val;
			}
		}
	}
	config.parserFunction[1] = [
		...Object.keys(mwConfig.functionSynonyms[1]),
		'=',
	];
	for (const [key, val] of Object.entries(mwConfig.img!)) {
		config.img[key] = val.slice(4);
	}
	return config;
};
