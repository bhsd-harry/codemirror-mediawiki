import {CodeMirror6} from 'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.1.12/dist/main.min.js';
import type {Config} from 'wikilint';
import type {LintSource} from '../src/codemirror';
import type {MwConfig} from '../src/mediawiki';

declare interface MagicWord {
	name: string;
	aliases: string[];
	'case-sensitive': boolean;
}

mw.loader.load(
	'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.1.12/mediawiki.min.css',
	'text/css',
);

const instances = new WeakMap<HTMLTextAreaElement, CodeMirror>();
const getInstance = ($ele: JQuery<HTMLTextAreaElement>): CodeMirror => instances.get($ele[0]!)!;

/**
 * jQuery.val overrides for CodeMirror.
 */
$.valHooks['textarea'] = {
	get(elem: HTMLTextAreaElement): string {
		const cm = instances.get(elem);
		return cm?.visible ? cm.view.state.doc.toString() : elem.value;
	},
	set(elem: HTMLTextAreaElement, value: string): void {
		const cm = instances.get(elem);
		if (cm?.visible) {
			cm.setContent(value);
		} else {
			elem.value = value;
		}
	},
};

function getCaretPosition(this: JQuery<HTMLTextAreaElement>, option: {startAndEnd: true}): [number, number];
function getCaretPosition(this: JQuery<HTMLTextAreaElement>, option?: {startAndEnd?: false}): number;
function getCaretPosition(
	this: JQuery<HTMLTextAreaElement>,
	option?: {startAndEnd?: boolean},
): [number, number] | number {
	const {view: {state: {selection: {main}}}} = getInstance(this);
	return option?.startAndEnd ? [main.from, main.to] : main.head;
}

/**
 * jQuery.textSelection overrides for CodeMirror.
 * See jQuery.textSelection.js for method documentation
 */
const textSelection = {
	getContents(this: JQuery<HTMLTextAreaElement>): string {
		return getInstance(this).view.state.doc.toString();
	},
	setContents(this: JQuery<HTMLTextAreaElement>, content: string): JQuery<HTMLTextAreaElement> {
		getInstance(this).setContent(content);
		return this;
	},
	getSelection(this: JQuery<HTMLTextAreaElement>): string {
		const {view: {state}} = getInstance(this);
		return state.sliceDoc(state.selection.main.from, state.selection.main.to);
	},
	setSelection(
		this: JQuery<HTMLTextAreaElement>,
		{start, end}: {start: number, end?: number},
	): JQuery<HTMLTextAreaElement> {
		const {view} = getInstance(this);
		view.dispatch({
			selection: {anchor: start, head: end ?? start},
		});
		view.focus();
		return this;
	},
	replaceSelection(this: JQuery<HTMLTextAreaElement>, value: string): JQuery<HTMLTextAreaElement> {
		const {view} = getInstance(this);
		view.dispatch(view.state.replaceSelection(value));
		return this;
	},
	getCaretPosition,
	scrollToCaretPosition(this: JQuery<HTMLTextAreaElement>): JQuery<HTMLTextAreaElement> {
		getInstance(this).view.dispatch({scrollIntoView: true});
		return this;
	},
};

// 和本地缓存有关的常数
const USING_LOCAL = mw.loader.getState('ext.CodeMirror') !== null,
	DATA_MODULE = mw.loader.getState('ext.CodeMirror.data') ? 'ext.CodeMirror.data' : 'ext.CodeMirror',
	ALL_SETTINGS_CACHE: Record<string, {time: number, config: MwConfig}>
		= JSON.parse(localStorage.getItem('InPageEditMwConfig')!) ?? {},
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

const getConfigPair = (
	magicWords: MagicWord[],
	rule: (word: MagicWord) => boolean,
): [Record<string, string>, Record<string, string>] => [true, false]
	.map(bool => getConfig(magicWords, rule, bool)) as [Record<string, string>, Record<string, string>];

/** 将设置保存到mw.config */
const setConfig = (config: MwConfig): void => {
	mw.config.set('extCodeMirrorConfig', config);
};

/** 加载CodeMirror的mediawiki模块需要的设置 */
const getMwConfig = async (): Promise<MwConfig> => {
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
	}
	config!.img = getConfig(magicwords, ({name}) => name.startsWith('img_'));
	config!.variants = variants ? variants.map(({code}) => code) : [];
	config!.nsid = mw.config.get('wgNamespaceIds');
	setConfig(config!);
	ALL_SETTINGS_CACHE[SITE_ID] = {config: config!, time: Date.now()};
	localStorage.setItem('InPageEditMwConfig', JSON.stringify(ALL_SETTINGS_CACHE));
	return config!;
};

const linters: Record<string, LintSource | undefined> = {};

const {vendor, userAgent, maxTouchPoints, platform} = navigator,
	modKey = vendor.includes('Apple Computer') && (userAgent.includes('Mobile/') || maxTouchPoints > 2)
	|| platform.includes('Mac')
		? 'metaKey'
		: 'ctrlKey',
	pageSelector = '.cm-mw-template-name, .cm-mw-link-pagename';

/** 点击时在新页面打开链接、模板等 */
const openLinks = function(this: HTMLElement, e: JQuery.ClickEvent): void {
	if (!e[modKey]) {
		return;
	}
	e.preventDefault();
	let page = this.textContent!,
		{previousSibling, nextSibling} = this;
	while (
		previousSibling
		&& (previousSibling.nodeType === Node.TEXT_NODE || (previousSibling as Element).matches(pageSelector))
	) {
		page = previousSibling.textContent! + page;
		({previousSibling} = previousSibling);
	}
	while (
		nextSibling
		&& (nextSibling.nodeType === Node.TEXT_NODE || (nextSibling as Element).matches(pageSelector))
	) {
		page += nextSibling.textContent!;
		({nextSibling} = nextSibling);
	}
	page = page.trim();
	if (page.startsWith('/')) {
		page = `:${mw.config.get('wgPageName')}${page}`;
	}
	open(new mw.Title(page, this.classList.contains('cm-mw-template-name') ? 10 : 0).getUrl(undefined), '_blank');
};

mw.loader.addStyleTag(`.wikiEditor-ui-toolbar{z-index:7}${pageSelector}{cursor:var(--codemirror-cursor)}`);

class CodeMirror extends CodeMirror6 {
	/**
	 * @param textarea 文本框
	 * @param lang 语言
	 * @param config 语言设置
	 */
	constructor(textarea: HTMLTextAreaElement, lang?: string, config?: unknown) {
		super(textarea, lang, config);
		instances.set(textarea, this);
		if (mw.loader.getState('jquery.textSelection') === 'ready') {
			$(textarea).data('jquery.textSelection', textSelection);
		}
		mw.hook('wiki-codemirror6').fire(this);
	}

	override toggle(show = !this.visible): void {
		super.toggle(show);
		$(this.textarea).data('jquery.textSelection', show && textSelection);
	}

	override async getLinter(opt?: Record<string, unknown>): Promise<LintSource | undefined> {
		const linter = await super.getLinter(opt);
		linters[this.lang] = linter;
		return linter;
	}

	/**
	 * 添加或移除默认 linter
	 * @param on 是否添加
	 * @param opt linter选项
	 * @param ns 命名空间
	 */
	defaultLint(on: boolean, opt?: Record<string, unknown>): Promise<void>;
	defaultLint(on: boolean, ns: number): Promise<void>;
	async defaultLint(on: boolean, optOrNs?: Record<string, unknown> | number): Promise<void> {
		if (!on) {
			this.lint();
			return;
		}
		const {lang} = this;
		let opt: Record<string, unknown> | undefined;
		if (typeof optOrNs === 'number') {
			if (lang === 'mediawiki' && (optOrNs === 10 || optOrNs === 828 || optOrNs === 2)) {
				opt = {include: true};
			} else if (lang === 'javascript' && (optOrNs === 8 || optOrNs === 2300)) {
				opt = {
					env: {browser: true, es6: true},
					parserOptions: {ecmaVersion: 6},
				};
			}
		} else {
			opt = optOrNs;
		}
		if (!(lang in linters)) {
			if (lang === 'mediawiki') {
				const i18n = mw.config.get('wgUserLanguage');
				if (['zh', 'zh-hans', 'zh-cn', 'zh-sg', 'zh-my'].includes(i18n)) {
					opt = {...opt, i18n: 'zh-hans'};
				} else if (['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'].includes(i18n)) {
					opt = {...opt, i18n: 'zh-hant'};
				}
			}
			await this.getLinter(opt);
			if (lang === 'mediawiki') {
				const mwConfig = await getMwConfig(),
					config: Config = {
						...await wikiparse.getConfig(),
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
				for (const key of Object.keys(mwConfig.img!)) {
					config.img[key] = mwConfig.img![key]!.slice(4);
				}
				wikiparse.setConfig(config);
			}
		} else if (opt) {
			await this.getLinter(opt);
		}
		if (linters[lang]) {
			this.lint(linters[lang]);
		}
	}

	/** @override */
	override prefer(extensions: string[]): void {
		super.prefer(extensions);
		if (extensions.includes('openLinks')) {
			mw.loader.load('mediawiki.Title');
			$(this.view.contentDOM).on('click', pageSelector, openLinks).css('--codemirror-cursor', 'pointer');
		} else {
			$(this.view.contentDOM).off('click', pageSelector, openLinks).css('--codemirror-cursor', '');
		}
	}

	/**
	 * 将 textarea 替换为 CodeMirror
	 * @param textarea textarea 元素
	 * @param lang 语言
	 */
	static async fromTextArea(textarea: HTMLTextAreaElement, lang?: string): Promise<CodeMirror> {
		const isWiki = lang === 'mediawiki' || lang === 'html',
			cm = new CodeMirror(textarea, isWiki ? undefined : lang);
		if (isWiki) {
			const config = await getMwConfig();
			cm.setLanguage(lang, config);
		}
		return cm;
	}
}

document.body.addEventListener('click', e => {
	if (e.target instanceof HTMLTextAreaElement && e.shiftKey && !instances.has(e.target)) {
		e.preventDefault();
		(async () => {
			const {wgAction, wgNamespaceNumber, wgPageContentModel} = mw.config.get();
			let lang: string | undefined;
			if (wgAction !== 'edit' && wgAction !== 'submit') {
				await mw.loader.using('oojs-ui-windows');
				lang = (await OO.ui.prompt('Language:') || undefined)?.toLowerCase();
			} else {
				switch (wgPageContentModel) {
					case 'css':
					case 'sanitized-css':
						lang = 'css';
						break;
					case 'javascript':
						lang = 'javascript';
						break;
					case 'json':
						lang = 'json';
						break;
					case 'Scribunto':
						lang = 'lua';
						break;
					case 'wikitext':
						lang = wgNamespaceNumber === 274 ? 'html' : 'mediawiki';
						break;
					// no default
				}
			}
			const cm = await CodeMirror.fromTextArea(e.target as HTMLTextAreaElement, lang);
			void cm.defaultLint(true, wgNamespaceNumber);
		})();
	}
});

Object.assign(window, {CodeMirror6: CodeMirror});
