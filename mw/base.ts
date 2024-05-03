import {CodeMirror6, CDN} from 'https://testingcf.jsdelivr.net/npm/@bhsd/codemirror-mediawiki@2.11.3/dist/main.min.js';
import {getMwConfig, getParserConfig} from './config';
import {openLinks} from './openLinks';
import {instances, textSelection, monacoTextSelection} from './textSelection';
import {openPreference, prefs, indentKey, wikilintConfig, codeConfigs, loadJSON} from './preference';
import {msg, setI18N, welcome, REPO_CDN, curVersion, localize} from './msg';
import {wikiEditor} from './wikiEditor';
import type {Diagnostic} from '@codemirror/lint';
import type {Config, LintError} from 'wikiparser-node';
import type {Linter} from 'eslint';
import type * as Monaco from 'monaco-editor';
import type {LintSource, MwConfig} from '../src/codemirror';

declare global {
	const monaco: typeof Monaco;
}

// 每次新增插件都需要修改这里
const baseVersion = '2.11',
	addons = ['useMonaco'];

mw.loader.load(`${CDN}/${REPO_CDN}/mediawiki.min.css`, 'text/css');

/**
 * jQuery.val overrides for CodeMirror.
 */
$.valHooks['textarea'] = {
	get(elem: HTMLTextAreaElement): string {
		const cm = instances.get(elem);
		return cm?.visible ? cm.getContent() : elem.value;
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
	},
	monacoLangs: Record<string, string> = {
		mediawiki: 'wikitext',
		template: 'wikitext',
		gadget: 'javascript',
		plain: 'plaintext',
	};

/**
 * 判断是否为普通编辑器
 * @param textarea 文本框
 */
const isEditor = (textarea: HTMLTextAreaElement): boolean => !textarea.closest('#cm-preference');

/** 专用于MW环境的 CodeMirror 6 编辑器 */
export class CodeMirror extends CodeMirror6 {
	static version = curVersion;

	declare ns;
	#visible = true;
	#container: HTMLDivElement | undefined;
	#model: Monaco.editor.ITextModel | undefined;
	#editor: Monaco.editor.IStandaloneCodeEditor | undefined;
	#init;
	#indentStr = '\t';

	override get visible(): boolean {
		return this.#visible;
	}

	get model(): Monaco.editor.ITextModel | undefined {
		return this.#model;
	}

	get editor(): Monaco.editor.IStandaloneCodeEditor | undefined {
		return this.#editor;
	}

	/**
	 * @param textarea 文本框
	 * @param lang 语言
	 * @param ns 命名空间
	 * @param config 语言设置
	 * @param isCM 是否使用 CodeMirror
	 */
	constructor(textarea: HTMLTextAreaElement, lang?: string, ns?: number, config?: unknown, isCM = true) {
		if (instances.get(textarea)?.visible) {
			throw new RangeError('The textarea has already been replaced by CodeMirror.');
		}
		super(textarea, lang, config, false);
		this.ns = ns;
		instances.set(textarea, this);
		if (isCM) {
			this.initialize(config);
		} else {
			this.#init = this.#initMonaco();
			$(textarea).data('jquery.textSelection', monacoTextSelection);
		}
		if (isEditor(textarea)) {
			mw.hook('wiki-codemirror6').fire(this);
			if (textarea.id === 'wpTextbox1') {
				textarea.form?.addEventListener('submit', () => {
					const scrollTop = document.querySelector<HTMLInputElement>('#wpScrolltop');
					if (scrollTop && this.view && this.#visible) {
						scrollTop.value = String(this.view.scrollDOM.scrollTop);
					}
				});
			}
		}
	}

	/** 初始化 Monaco 编辑器 */
	async #initMonaco(): Promise<void> {
		if (!('monaco' in window)) {
			await $.ajax(
				`${CDN}/npm/monaco-wiki/dist/all.min.js`,
				{dataType: 'script', scriptAttrs: {type: 'module'}} as JQuery.AjaxSettings,
			);
		}
		const {textarea, lang: cmLang} = this,
			lang = monacoLangs[cmLang] || cmLang,
			tab = this.#indentStr.includes('\t');
		// eslint-disable-next-line @typescript-eslint/await-thenable
		this.#model = (await monaco).editor.createModel(textarea.value, lang);
		this.#container = document.createElement('div');
		this.#refresh();
		this.#container.style.minHeight = '2em';
		textarea.after(this.#container);
		textarea.style.display = 'none';
		this.#editor = monaco.editor.create(this.#container, {
			model: this.#model,
			automaticLayout: true,
			theme: 'monokai',
			readOnly: textarea.readOnly,
			wordWrap: lang === 'wikitext' || lang === 'html' || lang === 'plaintext' ? 'on' : 'off',
			wordBreak: 'keepAll',
			tabSize: tab ? 4 : Number(this.#indentStr),
			insertSpaces: !tab,
			glyphMargin: true,
			fontSize: parseFloat(getComputedStyle(textarea).fontSize),
			unicodeHighlight: {
				ambiguousCharacters: lang !== 'wikitext' && lang !== 'html' && lang !== 'plaintext',
			},
		});
		let timer: number;
		this.#model.onDidChangeContent(() => {
			clearTimeout(timer);
			timer = window.setTimeout(() => {
				textarea.value = this.#model!.getValue();
			}, 400);
		});
	}

	/** 刷新 Monaco 编辑器高度 */
	#refresh(): void {
		const {textarea: {offsetHeight, style: {height}}} = this;
		this.#container!.style.height = offsetHeight ? `${offsetHeight}px` : height;
	}

	override toggle(show = !this.#visible): void {
		const {textarea} = this;
		if (!this.#model) {
			super.toggle(show);
			$(textarea).data('jquery.textSelection', show && textSelection);
		} else if (show && !this.#visible) {
			this.#model.setValue(textarea.value);
			this.#refresh();
			this.#container!.style.display = '';
			textarea.style.display = 'none';
			$(textarea).data('jquery.textSelection', monacoTextSelection);
		} else if (!show && this.#visible) {
			this.#container!.style.display = 'none';
			textarea.style.display = '';
			$(textarea).removeData('jquery.textSelection');
		}
		this.#visible = show;
	}

	override setContent(content: string): void {
		if (this.#model) {
			this.#model.setValue(content);
		} else {
			super.setContent(content);
		}
	}

	/** 获取编辑器内容 */
	getContent(): string {
		return this.view ? this.view.state.doc.toString() : this.#model!.getValue();
	}

	override setIndent(indent: string): void {
		if (this.#editor) {
			this.#indentStr = indent;
			const tab = indent.includes('\t');
			this.#editor.updateOptions({tabSize: tab ? 4 : Number(indent), insertSpaces: !tab});
		} else {
			super.setIndent(indent);
		}
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
		if (this.view) {
			super.prefer(extensions);
			const hasExtension = Array.isArray(extensions)
					? (ext: string): boolean => extensions.includes(ext)
					: (ext: string): boolean | undefined => extensions[ext],
				hasLint = hasExtension('lint');
			if (hasLint !== undefined) {
				void this.defaultLint(hasLint);
			}
			openLinks(this, hasExtension('openLinks'));
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
		const isCM = !prefs.has('useMonaco'),
			isWiki = isCM && (lang === 'mediawiki' || lang === 'html'),
			cm = new CodeMirror(textarea, isWiki ? undefined : lang, ns, undefined, isCM);
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
		await Promise.all([loadJSON, cm.#init]);
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
