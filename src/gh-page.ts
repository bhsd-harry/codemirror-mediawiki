import {CodeMirror6} from '/codemirror-mediawiki/dist/main.min.js';
import type {Config} from 'wikiparser-node';
import type {MwConfig, LintSource} from '/codemirror-mediawiki/src/codemirror';

(() => {
	if (!location.pathname.startsWith('/codemirror-mediawiki')) {
		return;
	}

	// 初始化DOM元素
	const textarea = document.querySelector<HTMLTextAreaElement>('#wpTextbox')!,
		languages = [...document.querySelectorAll<HTMLInputElement>('input[name="language"]')],
		extensions = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')],
		indent = document.querySelector<HTMLInputElement>('#indent')!,
		search = new URLSearchParams(location.search);
	if (search.has('rtl')) {
		textarea.dir = 'rtl';
	}
	if (search.has('indent')) {
		indent.value = search.get('indent')!;
	}
	for (const extension of extensions) {
		extension.checked = search.has(extension.id);
	}

	const mediawikiOnly = ['escape', 'tagMatching', 'refHover', 'openLinks'],
		cm = new CodeMirror6(textarea),
		linters: Record<string, LintSource | undefined> = {};
	let config: MwConfig | undefined,
		parserConfig: Config | undefined;

	/**
	 * 设置语言
	 * @param lang 语言
	 */
	const init = async (lang: string): Promise<void> => {
		const isMediaWiki = lang === 'mediawiki',
			display = isMediaWiki ? '' : 'none';
		for (const id of mediawikiOnly) {
			document.getElementById(id)!.closest<HTMLElement>('.fieldLayout')!.style.display = display;
		}
		if (isMediaWiki || lang === 'html') {
			// eslint-disable-next-line require-atomic-updates
			parserConfig ??= await (await fetch('/wikiparser-node/config/default.json')).json();
			config ??= CodeMirror6.getMwConfig(parserConfig!);
			Object.assign(cm, {config});
		}
		await cm.setLanguage(lang, config);
		if (search.get('lint') !== '0' && !(lang in linters)) {
			linters[lang] = await cm.getLinter();
			if (isMediaWiki) {
				wikiparse.setConfig(parserConfig!);
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
		history.replaceState(null, '', url.toString()); // eslint-disable-line no-restricted-globals
	};

	/** 设置扩展 */
	const prefer = function(this: HTMLInputElement): void {
		cm.prefer({[this.id]: this.checked});
		updateSearch(this.id, Number(this.checked));
	};

	/** 设置缩进 */
	const indentChange = (): void => {
		const {value} = indent;
		cm.setIndent(value || '\t');
		updateSearch('indent', value);
	};

	// 初始化语言
	for (const input of languages) {
		input.addEventListener('change', () => {
			void init(input.id);
			location.hash = `#${input.id.charAt(0).toUpperCase()}${input.id.slice(1)}`;
		});
		if (input.checked) {
			void init(input.id);
		}
	}
	const hashMap = new Map<string, string>([
		['wiki', 'mediawiki'],
		['wikitext', 'mediawiki'],
		['mediawiki', 'mediawiki'],
		['javascript', 'javascript'],
		['js', 'javascript'],
		['css', 'css'],
		['lua', 'lua'],
		['json', 'json'],
	]);
	addEventListener('hashchange', () => {
		const target = hashMap.get(location.hash.slice(1).toLowerCase()),
			element = languages.find(({id}) => id === target);
		if (element) {
			element.checked = true;
			element.dispatchEvent(new Event('change'));
		}
	});
	dispatchEvent(new Event('hashchange'));

	// 初始化扩展
	for (const extension of extensions) {
		extension.addEventListener('change', prefer);
	}
	cm.prefer(extensions.filter(({checked}) => checked).map(({id}) => id));

	// 初始化缩进
	indent.addEventListener('change', indentChange);
	indentChange();

	Object.assign(globalThis, {cm});
})();
