import {
	CodeMirror6,
	registerCSS,
	registerHTML,
	registerJSON,
	registerJSONC,
	registerJavaScript,
	registerLua,
	registerMediaWiki,
	registerVue,
	registerAbuseFilter,
	registerTheme,
	registerBidiIsolates,
	nord,
} from '/codemirror-mediawiki/dist/main.min.js';
import abusefilterDialect from '@bhsd/lezer-abusefilter/test/src/dialect';
import {linkSuggest, paramSuggest, templateSignature} from './suggest.test';
import type {ConfigData} from 'wikiparser-node';
import type {Dialect} from '@bhsd/lezer-abusefilter';
import type {MwConfig, LintSource} from '/codemirror-mediawiki/src/index';

registerCSS();
registerHTML();
registerJSON();
registerJSONC();
registerJavaScript();
registerLua();
registerMediaWiki('https://www.mediawiki.org/wiki/', true);
registerVue();
registerAbuseFilter();
registerTheme('dark', nord);
registerBidiIsolates();

if (location.pathname.startsWith('/codemirror-mediawiki')) {
	// 初始化DOM元素
	const textarea = document.querySelector<HTMLTextAreaElement>('#wpTextbox')!,
		languages = [...document.querySelectorAll<HTMLInputElement>('input[name=language]')],
		extensions = [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')],
		indent = document.querySelector<HTMLInputElement>('#indent')!,
		col = document.querySelector<HTMLInputElement>('#col')!,
		search = new URLSearchParams(location.search);
	if (search.has('rtl')) {
		textarea.dir = 'rtl';
	}
	if (search.has('indent')) {
		indent.value = search.get('indent')!;
	}
	if (search.has('col')) {
		col.value = String(Number(search.get('col')!) || 0);
	}
	for (const extension of extensions) {
		extension.checked = search.has(extension.id);
	}

	const mediawikiOnly = ['escape', 'refHover', 'hover', 'signatureHelp', 'inlayHints', 'openLinks'],
		nonMediawiki = ['indentGuide', 'col'],
		htmlOnly = ['closeTags'],
		htmlLangs = new Set(['mediawiki', 'html', 'vue']),
		cssOnly = ['colorPicker'],
		cssLangs = new Set([...htmlLangs, 'css']),
		abusefilterOnly = ['hover', 'signatureHelp'],
		cm = new CodeMirror6(textarea),
		linters: Record<string, LintSource | undefined> = {};
	let config: MwConfig | Dialect | undefined,
		mwConfig: MwConfig | undefined,
		fetchConfig: Promise<ConfigData> | undefined;

	/**
	 * 获取选项的样式
	 * @param id 选项id
	 */
	const getLayoutStyle = (id: string): CSSStyleDeclaration => document.getElementById(id)!
		.closest<HTMLElement>('.fieldLayout')!.style;

	/**
	 * 设置语言
	 * @param lang 语言
	 */
	const init = async (lang: string): Promise<void> => {
		const isMediaWiki = lang === 'mediawiki',
			display = isMediaWiki ? '' : 'none',
			revertDisplay = isMediaWiki ? 'none' : '',
			cssDisplay = cssLangs.has(lang) ? '' : 'none',
			htmlDisplay = htmlLangs.has(lang) ? '' : 'none',
			abusefilterDisplay = isMediaWiki || lang === 'abusefilter' ? '' : 'none';
		let parserConfig: ConfigData | undefined;
		for (const id of mediawikiOnly) {
			getLayoutStyle(id).display = display;
		}
		for (const id of nonMediawiki) {
			getLayoutStyle(id).display = revertDisplay;
		}
		for (const id of cssOnly) {
			getLayoutStyle(id).display = cssDisplay;
		}
		for (const id of htmlOnly) {
			getLayoutStyle(id).display = htmlDisplay;
		}
		for (const id of abusefilterOnly) {
			getLayoutStyle(id).display = abusefilterDisplay;
		}
		if (isMediaWiki || lang === 'html') {
			fetchConfig ??= (async () => (await fetch('/wikiparser-node/config/default.json')).json())();
			parserConfig = await fetchConfig;
			if (!mwConfig) {
				mwConfig = {
					...CodeMirror6.getMwConfig(parserConfig),
					linkSuggest,
					...location.host === 'localhost:8080' && {paramSuggest, templateSignature},
				};
				Object.assign(cm, {mwConfig});
			}
			config = mwConfig;
		} else if (lang === 'abusefilter') {
			config = abusefilterDialect;
		}
		await cm.setLanguage(lang, config);
		if (search.get('lint') !== '0' && !Object.hasOwn(linters, lang)) {
			linters[lang] = await cm.getLinter();
			if (isMediaWiki && typeof wikiparse === 'object') {
				wikiparse.setConfig(Object.assign(await wikiparse.getConfig(), parserConfig!));
			}
			if (linters[lang]) {
				cm.lint(linters[lang]);
			}
		}
	};

	/**
	 * 更新search
	 * @param key 键
	 * @param value 值
	 */
	const updateSearch = (key: string, value: string | number): void => {
		const url = new URL(location.href);
		if (value) {
			url.searchParams.set(key, String(value));
		} else {
			url.searchParams.delete(key);
		}
		history.replaceState(null, '', url.href); // eslint-disable-line no-restricted-globals
	};

	/** 设置扩展 */
	const prefer = function(this: HTMLInputElement): void {
		const {id, checked} = this;
		if (id === 'dark') {
			cm.setTheme(checked ? 'dark' : 'light');
		} else {
			cm.prefer({[id]: checked});
		}
		updateSearch(id, Number(checked));
	};

	/** 设置缩进 */
	const indentChange = (): void => {
		const {value} = indent;
		cm.setIndent(value || '\t');
		updateSearch('indent', value);
	};

	/** 设置行宽辅助线 */
	const colChange = (): void => {
		const column = Number(col.value);
		cm.setColumnGuide(column);
		updateSearch('col', column);
	};

	// 初始化语言
	for (const input of languages) {
		input.addEventListener('change', () => {
			void init(input.id);
			history.replaceState( // eslint-disable-line no-restricted-globals
				null,
				'',
				`#${input.id.charAt(0).toUpperCase()}${input.id.slice(1)}`,
			);
		});
		if (input.checked) {
			void init(input.id);
		}
	}
	const hashMap = new Map([
		['wiki', 'mediawiki'],
		['wikitext', 'mediawiki'],
		['mediawiki', 'mediawiki'],
		['javascript', 'javascript'],
		['js', 'javascript'],
		['css', 'css'],
		['lua', 'lua'],
		['json', 'json'],
		['jsonc', 'jsonc'],
		['vue', 'vue'],
		['html', 'html'],
		['abusefilter', 'abusefilter'],
	]);
	addEventListener('hashchange', () => {
		const target = hashMap.get(location.hash.slice(1).toLowerCase()),
			element = languages.find(({id}) => id === target);
		if (element) {
			element.checked = true;
			element.dispatchEvent(new Event('change'));
		}
	});
	dispatchEvent(new HashChangeEvent('hashchange'));

	// 初始化扩展
	for (const extension of extensions) {
		extension.addEventListener('change', prefer);
	}
	cm.prefer(extensions.filter(({checked, id}) => checked && id !== 'dark').map(({id}) => id));
	cm.prefer({bidiIsolates: true});
	if (extensions.some(({checked, id}) => checked && id === 'dark')) {
		cm.setTheme('dark');
	}

	// 初始化缩进
	indent.addEventListener('change', indentChange);
	indentChange();

	// 初始化行宽辅助线
	col.addEventListener('change', colChange);
	colChange();

	Object.assign(globalThis, {cm});

	if (location.host === 'localhost:8080') {
		const queue: string[] = [],
			{body} = document;
		const isValid = (data: string, jsonc?: boolean): void => {
				const tag = jsonc ? 'maplink' : 'templatedata';
				queue.push(`<${tag}>\n${data}\n</${tag}>`);
			},
			isInvalid = (data: string, _?: unknown, jsonc?: boolean): void => {
				isValid(data, jsonc);
			},
			it = (_: string, callback: () => void): void => {
				callback();
			};
		Object.assign(globalThis, {isValid, isInvalid, it, describe: it});
		body.addEventListener('click', ({target}) => {
			if (target === body && cm.lang === 'mediawiki') {
				if (queue.length === 0) {
					console.error('No content in queue');
				} else {
					cm.setContent(queue.pop()!);
				}
			}
		});
	}
}
