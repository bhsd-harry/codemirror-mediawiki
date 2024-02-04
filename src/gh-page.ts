import {CodeMirror6} from '/codemirror-mediawiki/dist/main.min.js';
import type {Config} from 'wikilint';
import type {MwConfig, LintSource} from '/codemirror-mediawiki/src/codemirror';

/**
 * Object.fromEntries polyfill
 * @param entries
 * @param obj
 */
const fromEntries = (entries: readonly string[], obj: Record<string, unknown>): void => {
	for (const entry of entries) {
		obj[entry] = true;
	}
};

/**
 * 将wikiparser-node设置转换为codemirror-mediawiki设置
 * @param config
 */
export const getMwConfig = (config: Config): MwConfig => {
	const mwConfig: MwConfig = {
		tags: {},
		tagModes: {
			ref: 'text/mediawiki',
		},
		doubleUnderscore: [{}, {}],
		functionSynonyms: [config.parserFunction[0], {}],
		urlProtocols: `${config.protocol}|//`,
		nsid: config.nsid,
	};
	fromEntries(config.ext, mwConfig.tags);
	fromEntries(config.doubleUnderscore[0].map(s => `__${s}__`), mwConfig.doubleUnderscore[0]);
	fromEntries(config.doubleUnderscore[1].map(s => `__${s}__`), mwConfig.doubleUnderscore[1]);
	fromEntries((config.parserFunction.slice(2) as string[][]).flat(), mwConfig.functionSynonyms[0]);
	fromEntries(config.parserFunction[1], mwConfig.functionSynonyms[1]);
	return mwConfig;
};

(() => {
	if (!location.pathname.startsWith('/codemirror-mediawiki')) {
		return;
	}

	const textarea = document.querySelector<HTMLTextAreaElement>('#wpTextbox')!,
		languages = document.querySelectorAll<HTMLInputElement>('input[name="language"]'),
		extensions = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')],
		indent = document.querySelector<HTMLInputElement>('#indent')!,
		escape = document.getElementById('escape')!.closest<HTMLElement>('.fieldLayout')!,
		codeFolding = document.getElementById('codeFolding')!.closest<HTMLElement>('.fieldLayout')!,
		cm = new CodeMirror6(textarea),
		/** @todo 避免重复加载linter的逻辑应该由CodeMirror6.prototype.getLinter实现 */
		linters: Record<string, LintSource | undefined> = {};
	let config: MwConfig | undefined,
		parserConfig: Config | undefined;

	/**
	 * 设置语言
	 * @param lang 语言
	 */
	const init = async (lang: string): Promise<void> => {
		const isMediaWiki = lang === 'mediawiki';
		escape.style.display = isMediaWiki ? '' : 'none';
		codeFolding.style.display = isMediaWiki ? '' : 'none';
		if (isMediaWiki || lang === 'html') {
			// eslint-disable-next-line require-atomic-updates
			parserConfig ||= await (await fetch('/wikiparser-node/config/default.json')).json();
			config ||= getMwConfig(parserConfig!);
		}
		cm.setLanguage(lang, config);
		if (!(lang in linters)) {
			linters[lang] = await cm.getLinter();
			if (isMediaWiki) {
				wikiparse.setConfig(parserConfig!);
			}
			if (linters[lang]) {
				cm.lint(linters[lang]);
			}
		}
	};

	/** 设置扩展 */
	const prefer = function(this: HTMLInputElement): void {
		cm.prefer({[this.id]: this.checked});
	};

	/** 设置缩进 */
	const indentChange = (): void => {
		cm.setIndent(indent.value || '\t');
	};

	for (const input of languages) {
		input.addEventListener('change', () => {
			void init(input.id);
		});
		if (input.checked) {
			void init(input.id);
		}
	}
	for (const extension of extensions) {
		extension.addEventListener('change', prefer);
	}
	cm.prefer(extensions.filter(({checked}) => checked).map(({id}) => id));
	indent.addEventListener('change', indentChange);
	indentChange();

	Object.assign(window, {cm});
})();
