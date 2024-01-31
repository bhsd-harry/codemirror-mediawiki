import {CodeMirror6, CDN} from 'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.1.15/dist/main.min.js';
import {getMwConfig, USING_LOCAL} from './config';
import {openLinks, pageSelector} from './openLinks';
import {instances, textSelection} from './textSelection';
import {openPreference, storageKey, indentKey} from './preference';
import {msg} from './msg';
import {keymap} from './escape';
import type {Config} from 'wikilint';
import type {LintSource} from '../src/codemirror';

const REPO_CDN = 'npm/@bhsd/codemirror-mediawiki@2.1.15';
export {CDN, REPO_CDN};

mw.loader.load(`${CDN}/${REPO_CDN}/mediawiki.min.css`, 'text/css');

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

const linters: Record<string, LintSource | undefined> = {},
	prefs = new Set<string>(JSON.parse(localStorage.getItem(storageKey)!) as string[] | null);

mw.loader.addStyleTag(`.wikiEditor-ui-toolbar{z-index:7}${pageSelector}{cursor:var(--codemirror-cursor)}`);

export class CodeMirror extends CodeMirror6 {
	ns;

	/**
	 * @param textarea 文本框
	 * @param lang 语言
	 * @param ns 命名空间
	 * @param config 语言设置
	 */
	constructor(textarea: HTMLTextAreaElement, lang?: string, ns?: number, config?: unknown) {
		super(textarea, lang, config);
		this.ns = ns;
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
	defaultLint(on: boolean, opt: Record<string, unknown>): Promise<void>;
	defaultLint(on: boolean, ns?: number): Promise<void>;
	async defaultLint(on: boolean, optOrNs: Record<string, unknown> | number | undefined = this.ns): Promise<void> {
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
	override prefer(extensions: string[] | Record<string, boolean>): void {
		super.prefer(extensions);
		const hasExtension = Array.isArray(extensions)
				? (ext: string): boolean => extensions.includes(ext)
				: (ext: string): boolean | undefined => extensions[ext],
			hasOpenLinks = hasExtension('openLinks'),
			hasLint = hasExtension('lint'),
			hasEscape = hasExtension('escape');
		if (hasOpenLinks) {
			mw.loader.load('mediawiki.Title');
			$(this.view.contentDOM).on('click', pageSelector, openLinks).css('--codemirror-cursor', 'pointer');
		} else if (hasOpenLinks === false) {
			$(this.view.contentDOM).off('click', pageSelector, openLinks).css('--codemirror-cursor', '');
		}
		if (hasLint !== undefined) {
			void this.defaultLint(hasLint);
		}
		if (hasEscape) {
			this.extraKeys(keymap);
		} else if (hasEscape === false) {
			this.extraKeys([]);
		}
	}

	/**
	 * 将 textarea 替换为 CodeMirror
	 * @param textarea textarea 元素
	 * @param lang 语言
	 * @param ns 命名空间
	 */
	static async fromTextArea(textarea: HTMLTextAreaElement, lang?: string, ns?: number): Promise<CodeMirror> {
		const isWiki = lang === 'mediawiki' || lang === 'html',
			cm = new CodeMirror(textarea, isWiki ? undefined : lang, ns),
			indent = localStorage.getItem(indentKey);
		if (isWiki) {
			const config = await getMwConfig();
			cm.setLanguage(lang, config);
		}
		cm.prefer([...prefs]);
		if (indent) {
			cm.setIndent(indent);
		}
		return cm;
	}
}

const langMap: Record<string, string> = {
	'sanitized-css': 'css',
	js: 'javascript',
	scribunto: 'lua',
	wikitext: 'mediawiki',
};
document.body.addEventListener('click', e => {
	if (e.target instanceof HTMLTextAreaElement && e.shiftKey && !instances.has(e.target)) {
		e.preventDefault();
		(async () => {
			const {wgAction, wgNamespaceNumber, wgPageContentModel} = mw.config.get();
			let lang: string | undefined,
				ns: number | undefined;
			if (wgAction === 'edit' || wgAction === 'submit') {
				ns = wgNamespaceNumber;
				lang = wgNamespaceNumber === 274 ? 'html' : wgPageContentModel.toLowerCase();
			} else {
				await mw.loader.using('oojs-ui-windows');
				lang = (await OO.ui.prompt(msg('contentmodel')) || undefined)?.toLowerCase();
			}
			if (lang && lang in langMap) {
				lang = langMap[lang];
			}
			void CodeMirror.fromTextArea(e.target as HTMLTextAreaElement, lang, ns);
		})();
	}
});

(async () => {
	const portletContainer: Record<string, string> = {
		minerva: 'page-actions-overflow',
		moeskin: 'ca-more-actions',
	};
	await mw.loader.using('mediawiki.util');
	mw.util.addPortletLink(
		portletContainer[mw.config.get('skin')] || 'p-cactions',
		'#',
		msg('title'),
		'cm-settings',
	).addEventListener('click', e => {
		e.preventDefault();
		const textareas = [...document.querySelectorAll<HTMLTextAreaElement>('.cm-editor + textarea')];
		void openPreference(prefs, textareas.map(textarea => instances.get(textarea)));
	});
})();

Object.assign(window, {CodeMirror6: CodeMirror});
