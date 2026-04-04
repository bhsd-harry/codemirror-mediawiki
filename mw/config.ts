import {CDN, setObject, getObject} from '@bhsd/browser';
import {
	cleanAliases,
	getParserConfig as getParserConfigBase,
	getConfig,
	getVariants,
	getKeywords,
	otherParserFunctions,
} from '@bhsd/cm-util';
import {getStaticMwConfig} from '../src/static';
import type {MagicWord, MagicRule} from '@bhsd/cm-util';
import type {ConfigData} from 'wikiparser-node';
import type {MwConfigGetter, ParserConfigGetter} from '../src/mwConfig';
import type {MwConfig} from '../src/token';

const others = new Set([...otherParserFunctions, 'msgnw']);

/**
 * 将魔术字信息转换为CodeMirror接受的设置
 * @param magicWords 完整魔术字列表
 * @param rule 过滤函数
 */
const getConfigPair = (magicWords: MagicWord[], rule: MagicRule): [Record<string, string>, Record<string, string>] =>
	[true, false].map(bool => getConfig(magicWords, rule, bool)) as [Record<string, string>, Record<string, string>];

/**
 * 将设置保存到mw.config
 * @param config 设置
 */
const setConfig = (config: MwConfig): void => {
	mw.config.set('extCodeMirrorConfig', config);
};

export const getMwConfig: MwConfigGetter = async modes => {
	// 和本地缓存有关的常数
	const ALL_SETTINGS_CACHE: Record<string, {time: number, config: MwConfig}> =
			getObject('InPageEditMwConfig') ?? {},
		SITE_ID = typeof mw === 'object'
			? mw.config.get('wgServerName') + mw.config.get('wgScriptPath')
			: location.origin,
		SITE_SETTINGS = ALL_SETTINGS_CACHE[SITE_ID],
		VALID = Number(SITE_SETTINGS?.time) > Date.now() - 86_400 * 1e3 * 30;
	// 只在localStorage过期时才会重新加载ext.CodeMirror.data
	if (mw.loader.getState('ext.CodeMirror') !== null && !VALID) {
		await mw.loader.using(
			mw.loader.getState('ext.CodeMirror.data') ? 'ext.CodeMirror.data' : 'ext.CodeMirror',
		);
	}

	let config = mw.config.get('extCodeMirrorConfig') as MwConfig | null;
	if (!config && VALID) {
		({config} = SITE_SETTINGS!);
		setConfig(config);
	}
	const isIPE = config && Object.values(config.functionSynonyms[0]).includes(true as unknown as string),
		nsid = mw.config.get('wgNamespaceIds');
	// 情形1：config已更新，可能来自localStorage
	if (config?.img && config.redirection && config.variants && config.variableIDs && config.functionHooks && !isIPE) {
		config.urlProtocols = config.urlProtocols.replace(/\\:/gu, ':');
		config.tagModes = modes;
		return {...config, nsid};
	} else if (location.hostname.endsWith('.moegirl.org.cn')) {
		const parserConfig: ConfigData = await (await fetch(`${
			typeof wikiparse === 'object' ? wikiparse.CDN : `${CDN}/npm/wikiparser-node`
		}/config/moegirl.json`)).json();
		setObject('wikilintConfig', parserConfig);
		config = getStaticMwConfig(parserConfig, modes);
	} else {
		// 以下情形均需要发送API请求
		// 情形2：localStorage未过期但不包含新设置
		// 情形3：新加载的 ext.CodeMirror.data
		// 情形4：`config === null`
		await mw.loader.using('mediawiki.api');
		const {query: {general: {variants, langconversion}, magicwords, extensiontags, functionhooks, variables}}: {
			query: {
				general: {langconversion: boolean, variants?: {code: string}[]};
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
				...config && !isIPE ? [] : ['extensiontags'],
				...config?.variableIDs ? [] : ['variables'],
				...config?.functionHooks ? [] : ['functionhooks'],
			],
			formatversion: 2,
		}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

		// 先处理魔术字和状态开关
		if (config && !isIPE) { // 情形2或3
			const [insensitive] = config.functionSynonyms;
			if (!('subst' in insensitive)) {
				cleanAliases(insensitive);
				Object.assign(insensitive, getConfig(magicwords, ({name}) => others.has(name)));
			}
		} else { // 情形4：`config === null`
			const functions = new Set([
				...functionhooks.map(s => s.toLowerCase()),
				...variables,
				...others,
			]);
			// @ts-expect-error incomplete properties
			config = {
				tags: Object.fromEntries(extensiontags.map(tag => [tag.slice(1, -1), true])),
				functionSynonyms: getConfigPair(magicwords, ({name}) => functions.has(name)),
				doubleUnderscore: getConfigPair(
					magicwords,
					({aliases}) => aliases.some(alias => /^__.+__$/u.test(alias)),
				),
			};
		}
		cleanAliases(config!.functionSynonyms[1]);
		Object.assign(config!, {
			...getKeywords(magicwords, true),
			tagModes: modes,
			variants: langconversion ? getVariants(variants) : [],
			urlProtocols: mw.config.get('wgUrlProtocols').replace(/\\:/gu, ':'),
		});
		config!.variableIDs ??= variables;
		config!.functionHooks ??= functionhooks.map(s => s.toLowerCase());
		if (!config!.functionHooks.includes('msgnw')) {
			config!.functionHooks.push('msgnw');
		}
	}
	setConfig(config!);
	ALL_SETTINGS_CACHE[SITE_ID] = {config: config!, time: Date.now()};
	setObject('InPageEditMwConfig', ALL_SETTINGS_CACHE);
	return {...config!, nsid};
};

export const getParserConfig: ParserConfigGetter = (minConfig, mwConfig) => {
	let config: ConfigData | null = getObject('wikilintConfig');
	if (config) {
		return config;
	}
	const {nsid, variants, functionSynonyms, img} = mwConfig,
		[insensitive] = functionSynonyms;
	config = {
		...getParserConfigBase(minConfig, mwConfig),
		namespaces: mw.config.get('wgFormattedNamespaces'),
		nsid,
		variants: variants!,
		articlePath: mw.config.get('wgArticlePath'),
	};
	const noCM = mw.loader.getState('ext.CodeMirror') === null;
	for (const key in insensitive) {
		const val = insensitive[key]!;
		if (others.has(val) && val !== 'msgnw') {
			delete config.parserFunction[0][key];
			config.parserFunction[val === 'msg' || val === 'raw' ? 2 : 3].push(key);
		} else if (noCM && !key.startsWith('#')) {
			config.parserFunction[0][`#${key}`] = val;
		}
	}
	for (const key in img) {
		config.img[key] = img[key]!.slice(4).replace(/_/gu, '-');
	}
	return config;
};
