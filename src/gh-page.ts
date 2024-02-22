import {CodeMirror6} from '/codemirror-mediawiki/dist/main.min.js';
import type {Config} from 'wikiparser-node';
import type {MwConfig, LintSource} from '/codemirror-mediawiki/src/codemirror';

(() => {
	if (!location.pathname.startsWith('/codemirror-mediawiki')) {
		return;
	}

	const textarea = document.querySelector<HTMLTextAreaElement>('#wpTextbox')!,
		languages = document.querySelectorAll<HTMLInputElement>('input[name="language"]'),
		extensions = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')],
		indent = document.querySelector<HTMLInputElement>('#indent')!,
		mediawikiOnly = ['escape', 'codeFolding', 'tagMatching', 'autocompletion'],
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
			parserConfig ||= await (await fetch('/wikiparser-node/config/default.json')).json();
			config ||= CodeMirror6.getMwConfig(parserConfig!);
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
