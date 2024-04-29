import {CodeMirror6, CDN} from 'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.10.0/dist/main.min.js';
import {getMwConfig, getParserConfig} from './config';
import {openLinks} from './openLinks';
import {instances, textSelection} from './textSelection';
import {openPreference, prefs, indentKey, wikilintConfig, codeConfigs, loadJSON} from './preference';
import {msg, setI18N, welcome, REPO_CDN, curVersion, localize} from './msg';
import {wikiEditor} from './wikiEditor';
import type {Diagnostic} from '@codemirror/lint';
import type {Config, LintError} from 'wikiparser-node';
import type {Linter} from 'eslint';
import type {LintSource, MwConfig} from '../src/codemirror';

// 每次新增插件都需要修改这里
const baseVersion = '2.7',
	addons = ['save'];

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
	langMap: Record<string, string> = {
		'sanitized-css': 'css',
		js: 'javascript',
		scribunto: 'lua',
		wikitext: 'mediawiki',
	};

/**
 * 判断是否为普通编辑器
 * @param textarea 文本框
 */
const isEditor = (textarea: HTMLTextAreaElement): boolean => !textarea.closest('#cm-preference');

/** 专用于MW环境的 CodeMirror 6 编辑器 */
export class CodeMirror extends CodeMirror6 {
	static version = curVersion;

	ns;

	/**
	 * @param textarea 文本框
	 * @param lang 语言
	 * @param ns 命名空间
	 * @param config 语言设置
	 */
	constructor(textarea: HTMLTextAreaElement, lang?: string, ns?: number, config?: unknown) {
		if (instances.get(textarea)?.visible) {
			throw new RangeError('The textarea has already been replaced by CodeMirror.');
		}
		super(textarea, lang, config);
		this.ns = ns;
		instances.set(textarea, this);
		if (mw.loader.getState('jquery.textSelection') === 'ready') {
			$(textarea).data('jquery.textSelection', textSelection);
		}
		if (isEditor(textarea)) {
			mw.hook('wiki-codemirror6').fire(this);
			if (textarea.id === 'wpTextbox1') {
				textarea.form?.addEventListener('submit', () => {
					const scrollTop = document.querySelector<HTMLInputElement>('#wpScrolltop');
					if (scrollTop) {
						scrollTop.value = String(this.view.scrollDOM.scrollTop);
					}
				});
			}
		}
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
		const {lang} = this,
			eslint = codeConfigs.get('ESLint'),
			stylelint = codeConfigs.get('Stylelint');
		let opt: Record<string, unknown> | undefined;
		if (typeof optOrNs === 'number') {
			if (lang === 'mediawiki' && (optOrNs === 10 || optOrNs === 828 || optOrNs === 2)) {
				opt = {include: true};
			} else if (lang === 'javascript') {
				opt = {
					env: {browser: true, es2024: true, jquery: true},
					globals: {mw: 'readonly', mediaWiki: 'readonly', OO: 'readonly'},
					...optOrNs === 8 || optOrNs === 2300 ? {parserOptions: {ecmaVersion: 8}} : {},
					...eslint,
				} as Linter.Config as Record<string, unknown>;
			} else if (lang === 'css' && stylelint) {
				opt = stylelint;
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
			if (lang === 'mediawiki') {
				this.lint(
					async doc => (await linters[lang]!(doc) as (Diagnostic & {rule: LintError.Rule})[])
						.filter(({rule, severity}) => Number(wikilintConfig[rule]) > Number(severity === 'warning')),
				);
			} else {
				this.lint(linters[lang]);
			}
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
		openLinks(this, hasExtension('openLinks'));
		if (!Array.isArray(extensions)) {
			for (const [k, v] of Object.entries(extensions)) {
				prefs[v ? 'add' : 'delete'](k);
			}
		}
	}

	/**
	 * 将 textarea 替换为 CodeMirror
	 * @param textarea textarea 元素
	 * @param lang 语言
	 * @param ns 命名空间
	 */
	static async fromTextArea(textarea: HTMLTextAreaElement, lang?: string, ns?: number): Promise<CodeMirror> {
		if (prefs.has('wikiEditor') && isEditor(textarea)) {
			try {
				await wikiEditor($(textarea));
			} catch (e) {
				if (e instanceof Error && e.message === 'no-wikiEditor') {
					void mw.notify(msg(e.message), {type: 'error'});
				}
				prefs.delete('wikiEditor');
			}
		}
		/* eslint-disable no-param-reassign */
		if (!lang && ns === undefined) {
			const {wgAction, wgNamespaceNumber, wgPageContentModel} = mw.config.get();
			if (wgAction === 'edit' || wgAction === 'submit') {
				ns = wgNamespaceNumber;
				lang = wgNamespaceNumber === 274 ? 'html' : wgPageContentModel.toLowerCase();
			} else {
				await mw.loader.using('oojs-ui-windows');
				lang = (await OO.ui.prompt(msg('contentmodel')) || undefined)?.toLowerCase();
			}
		}
		if (lang && lang in langMap) {
			lang = langMap[lang];
		}
		/* eslint-enable no-param-reassign */
		const isWiki = lang === 'mediawiki' || lang === 'html',
			cm = new CodeMirror(textarea, isWiki ? undefined : lang, ns);
		if (isWiki) {
			let config: MwConfig;
			if (mw.config.get('wgServerName').endsWith('.moegirl.org.cn')) {
				if (mw.config.exists('wikilintConfig')) {
					config = mw.config.get('extCodeMirrorConfig') as MwConfig;
				} else {
					const parserConfig: Config = await (await fetch(
						`${CDN}/npm/wikiparser-node@browser/config/moegirl.json`,
					)).json();
					mw.config.set('wikilintConfig', parserConfig);
					config = CodeMirror6.getMwConfig(parserConfig);
					mw.config.set('extCodeMirrorConfig', config);
				}
			} else {
				config = await getMwConfig();
			}
			cm.setLanguage(lang, {...config, tagModes: CodeMirror.mwTagModes});
		}
		await loadJSON;
		cm.prefer([...prefs]);
		const indent = localStorage.getItem(indentKey);
		if (indent) {
			cm.setIndent(indent);
		}
		return cm;
	}
}

document.body.addEventListener('click', e => {
	if (e.target instanceof HTMLTextAreaElement && e.shiftKey && !instances.has(e.target)) {
		e.preventDefault();
		void CodeMirror.fromTextArea(e.target);
	}
});

(async () => {
	const portletContainer: Record<string, string> = {
		minerva: 'page-actions-overflow',
		moeskin: 'ca-more-actions',
		citizen: 'p-tb',
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
	)!.addEventListener('click', e => {
		e.preventDefault();
		const textareas = [...document.querySelectorAll<HTMLTextAreaElement>('.cm-editor + textarea')];
		void openPreference(textareas.map(textarea => instances.get(textarea)));
	});
	void welcome(baseVersion, addons);
})();

Object.assign(window, {CodeMirror6: CodeMirror});
