import {CodeMirror6, CDN} from 'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.3.5/dist/main.min.js';
import {getMwConfig, getParserConfig} from './config';
import {openLinks} from './openLinks';
import {instances, textSelection} from './textSelection';
import {openPreference, prefs, indentKey} from './preference';
import {msg, setI18N, welcome, REPO_CDN, localize} from './msg';
import type {LintSource} from '../src/codemirror';

// 每次新增插件都需要修改这里
const baseVersion = '2.3',
	addons = ['codeFolding'];

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

/** @todo 避免重复加载linter的逻辑应该由CodeMirror6.prototype.getLinter实现 */
const linters: Record<string, LintSource | undefined> = {};

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
				const [mwConfig, minConfig] = await Promise.all([getMwConfig(), wikiparse.getConfig()]);
				wikiparse.setConfig(getParserConfig(minConfig, mwConfig));
			}
		} else if (opt) {
			await this.getLinter(opt);
		}
		if (linters[lang]) {
			this.lint(linters[lang]);
		}
	}

	override prefer(extensions: string[] | Record<string, boolean>): void {
		super.prefer(extensions);
		const hasExtension = Array.isArray(extensions)
				? (ext: string): boolean => extensions.includes(ext)
				: (ext: string): boolean | undefined => extensions[ext],
			hasLint = hasExtension('lint');
		if (hasLint !== undefined) {
			void this.defaultLint(hasLint);
		}
		openLinks(this.view.contentDOM, hasExtension('openLinks'));
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
	await Promise.all([
		mw.loader.using('mediawiki.util'),
		setI18N(CDN),
	]);
	mw.hook('wiki-codemirror6').add(localize);
	mw.util.addPortletLink(
		portletContainer[mw.config.get('skin')] || 'p-cactions',
		'#',
		msg('title'),
		'cm-settings',
	).addEventListener('click', e => {
		e.preventDefault();
		const textareas = [...document.querySelectorAll<HTMLTextAreaElement>('.cm-editor + textarea')];
		void openPreference(textareas.map(textarea => instances.get(textarea)));
	});
	void welcome(baseVersion, addons);
})();

Object.assign(window, {CodeMirror6: CodeMirror});
