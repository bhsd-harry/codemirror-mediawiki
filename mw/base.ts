/* eslint-disable @typescript-eslint/dot-notation */
import {CodeMirror6} from 'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.0.14/dist/main.min.js';
import type {Config} from 'wikilint';
import type {LintSource} from '../src/codemirror';
import type {MwConfig} from '../src/mediawiki';

(() => {
	mw.loader.load(
		'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.0.14/mediawiki.min.css',
		'text/css',
	);

	const instances = new WeakMap<HTMLTextAreaElement, CodeMirror>();

	$.valHooks['textarea'] = {
		get(elem: HTMLTextAreaElement): string {
			const cm = instances.get(elem);
			return cm ? cm.view.state.doc.toString() : elem.value;
		},
		set(elem: HTMLTextAreaElement, value): void {
			const cm = instances.get(elem);
			if (cm) {
				cm.view.dispatch({
					changes: {from: 0, to: cm.view.state.doc.length, insert: value},
				});
			} else {
				elem.value = value;
			}
		},
	};

	function getCaretPosition(this: JQuery<HTMLTextAreaElement>, option: {startAndEnd: true}): [ number, number ];
	function getCaretPosition(this: JQuery<HTMLTextAreaElement>, option?: {startAndEnd?: false}): number;
	function getCaretPosition(
		this: JQuery<HTMLTextAreaElement>,
		option?: {startAndEnd?: boolean},
	): [number, number] | number {
		const {view: {state: {selection: {main}}}} = instances.get(this[0]!)!;
		return option?.startAndEnd ? [main.from, main.to] : main.head;
	}

	/**
	 * jQuery.textSelection overrides for CodeMirror.
	 * See jQuery.textSelection.js for method documentation
	 */
	const textSelection = {
		getContents(this: JQuery<HTMLTextAreaElement>): string {
			return instances.get(this[0]!)!.view.state.doc.toString();
		},
		setContents(this: JQuery<HTMLTextAreaElement>, content: string): JQuery<HTMLTextAreaElement> {
			const {view} = instances.get(this[0]!)!;
			view.dispatch({
				changes: {from: 0, to: view.state.doc.length, insert: content},
			});
			return this;
		},
		getSelection(this: JQuery<HTMLTextAreaElement>): string {
			const {view: {state}} = instances.get(this[0]!)!;
			return state.sliceDoc(state.selection.main.from, state.selection.main.to);
		},
		setSelection(
			this: JQuery<HTMLTextAreaElement>,
			{start, end}: {start: number, end?: number},
		): JQuery<HTMLTextAreaElement> {
			const {view} = instances.get(this[0]!)!;
			view.dispatch({
				selection: {anchor: start, head: end ?? start},
			});
			view.focus();
			return this;
		},
		replaceSelection(this: JQuery<HTMLTextAreaElement>, value: string): JQuery<HTMLTextAreaElement> {
			const {view} = instances.get(this[0]!)!;
			view.dispatch(view.state.replaceSelection(value));
			return this;
		},
		getCaretPosition,
		scrollToCaretPosition(this: JQuery<HTMLTextAreaElement>): JQuery<HTMLTextAreaElement> {
			instances.get(this[0]!)!.view.dispatch({scrollIntoView: true});
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
		EXPIRED = !(SITE_SETTINGS && SITE_SETTINGS.time > Date.now() - 86_400 * 1000 * 30);

	/** 展开别名列表 */
	const getAliases = (words: readonly {aliases: string[], name: string}[]): {alias: string, name: string}[] =>
		words.flatMap(({aliases, name}) => aliases.map(alias => ({alias, name})));

	/** 将别名信息转换为CodeMirror接受的设置 */
	const getConfig = (aliases: readonly {alias: string, name: string}[]): Record<string, string> => {
		const config: Record<string, string> = {};
		for (const {alias, name} of aliases) {
			config[alias.replace(/:$/u, '')] = name;
		}
		return config;
	};

	/** 加载CodeMirror的mediawiki模块需要的设置 */
	const getMwConfig = async (): Promise<MwConfig> => {
		if (USING_LOCAL && EXPIRED) { // 只在localStorage过期时才会重新加载ext.CodeMirror.data
			await mw.loader.using(DATA_MODULE);
		}

		let config = mw.config.get('extCodeMirrorConfig') as MwConfig | null;
		if (!config && !EXPIRED) {
			({config} = SITE_SETTINGS);
			mw.config.set('extCodeMirrorConfig', config);
		}
		const isIPE = config && Object.values(config.functionSynonyms[0]).includes(true as unknown as string);
		// 情形1：config已更新，可能来自localStorage
		if (config && config.img && config.variants && !isIPE) {
			return config;
		}

		// 以下情形均需要发送API请求
		// 情形2：localStorage未过期但不包含新设置
		// 情形3：新加载的 ext.CodeMirror.data
		// 情形4：`config === null`
		const {
			query: {general: {variants}, magicwords, extensiontags, functionhooks, variables},
		}: {
			query: {
				general: {variants?: {code: string}[]};
				magicwords: {name: string, aliases: string[], 'case-sensitive': boolean}[];
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
		const otherMagicwords = new Set(['msg', 'raw', 'msgnw', 'subst', 'safesubst']);

		if (config && !isIPE) { // 情形2或3
			const {functionSynonyms: [insensitive]} = config;
			if (!('subst' in insensitive)) {
				const aliases = getAliases(magicwords.filter(({name}) => otherMagicwords.has(name)));
				for (const {alias, name} of aliases) {
					insensitive[alias.replace(/:$/u, '')] = name;
				}
			}
		} else { // 情形4：`config === null`
			// @ts-expect-error incomplete properties
			config = {
				tagModes: {
					ref: 'text/mediawiki',
				},
				tags: {},
				urlProtocols: mw.config.get('wgUrlProtocols'),
			};
			for (const tag of extensiontags) {
				config!.tags[tag.slice(1, -1)] = true;
			}
			const realMagicwords = new Set([
					...functionhooks,
					...variables,
					...otherMagicwords,
				]),
				allMagicwords = magicwords.filter(
					({name, aliases}) =>
						aliases.some(alias => /^__.+__$/u.test(alias)) || realMagicwords.has(name),
				),
				sensitive = getAliases(
					allMagicwords.filter(word => word['case-sensitive']),
				),
				insensitive = getAliases(
					allMagicwords.filter(word => !word['case-sensitive']),
				).map(({alias, name}) => ({alias: alias.toLowerCase(), name}));
			config!.doubleUnderscore = [
				getConfig(insensitive.filter(({alias}) => /^__.+__$/u.test(alias))),
				getConfig(sensitive.filter(({alias}) => /^__.+__$/u.test(alias))),
			];
			config!.functionSynonyms = [
				getConfig(insensitive.filter(({alias}) => !/^__.+__|^#$/u.test(alias))),
				getConfig(sensitive.filter(({alias}) => !/^__.+__|^#$/u.test(alias))),
			];
		}
		config!.img = getConfig(
			getAliases(magicwords.filter(({name}) => name.startsWith('img_'))),
		);
		config!.variants = variants ? variants.map(({code}) => code) : [];
		mw.config.set('extCodeMirrorConfig', config);
		ALL_SETTINGS_CACHE[SITE_ID] = {config: config!, time: Date.now()};
		localStorage.setItem('InPageEditMwConfig', JSON.stringify(ALL_SETTINGS_CACHE));
		return config!;
	};

	const linters: Record<string, LintSource> = {};

	class CodeMirror extends CodeMirror6 {
		constructor(textarea: HTMLTextAreaElement, lang?: string, config?: unknown) {
			super(textarea, lang, config);
			instances.set(textarea, this);
			if (mw.loader.getState('jquery.textSelection') === 'ready') {
				$(textarea).data('jquery.textSelection', textSelection);
			}
		}

		async defaultLint(on: boolean): Promise<void> {
			if (!on) {
				super.lint();
				return;
			}
			const {lang} = this;
			if (!(lang in linters)) {
				linters[lang] = await this.getLinter();
				if (this.lang === 'mediawiki') {
					const mwConfig = await getMwConfig(),
						config: Config = {
							...await wikiparse.getConfig(),
							ext: Object.keys(mwConfig.tags),
							namespaces: mw.config.get('wgFormattedNamespaces'),
							nsid: mw.config.get('wgNamespaceIds'),
							doubleUnderscore: mwConfig.doubleUnderscore.map(
								obj => Object.keys(obj).map(s => s.slice(2, -2)),
							) as [ string[], string[] ],
							variants: mwConfig.variants!,
							protocol: mwConfig.urlProtocols,
						};
					[config.parserFunction[0]] = mwConfig.functionSynonyms;
					config.parserFunction[1] = [
						...Object.keys(mwConfig.functionSynonyms[1]),
						'=',
					];
					for (const key of Object.keys(mwConfig.img!)) {
						config.img[key] = mwConfig.img![key]!.slice(4);
					}
					wikiparse.setConfig(config);
				}
			}
			super.lint(linters[lang]);
		}

		static async fromTextArea(textarea: HTMLTextAreaElement, lang?: string): Promise<CodeMirror> {
			const cm = new CodeMirror(textarea, lang === 'mediawiki' ? undefined : lang);
			if (lang === 'mediawiki') {
				const config = await getMwConfig();
				cm.setLanguage('mediawiki', config);
			}
			return cm;
		}
	}

	$(document.body).click(async e => {
		if (e.target instanceof HTMLTextAreaElement && (e.ctrlKey || e.metaKey) && !instances.has(e.target)) {
			e.preventDefault();
			await mw.loader.using('oojs-ui-windows');
			const lang = await OO.ui.prompt('Language:') || undefined,
				cm = await CodeMirror.fromTextArea(e.target, lang?.toLowerCase());
			void cm.defaultLint(true);
		}
	});

	Object.assign(window, {CodeMirror});
})();
