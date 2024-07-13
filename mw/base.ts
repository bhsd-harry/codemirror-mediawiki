import {CodeMirror6, CDN} from '../src/codemirror';
import {getMwConfig, getParserConfig} from './config';
import {openLinks, linkProvider} from './openLinks';
import {instances, textSelection, monacoTextSelection} from './textSelection';
import {openPreference, prefs, useMonaco, indentKey, wikilint, codeConfigs, loadJSON} from './preference';
import {msg, setI18N, welcome, REPO_CDN, curVersion, localize, languages} from './msg';
import {getEscapeActions} from './escape';
import wikiEditor from './wikiEditor';
import type {Diagnostic} from '@codemirror/lint';
import type {LintError} from 'wikiparser-node';
import type {Linter} from 'eslint';
import type * as Monaco from 'monaco-editor';
import type {ApiOpenSearchParams, TemplateDataApiTemplateDataParams} from 'types-mediawiki/api_params';
import type {LintSource, MwConfig} from '../src/codemirror';
import type {ApiSuggest, ApiSuggestions} from '../src/token';

declare global {
	const monaco: typeof Monaco;
}

declare interface TemplateParam {
	label: string | null;
	aliases: string[];
}

declare interface IWikitextModel extends Monaco.editor.ITextModel {
	lint?: (this: IWikitextModel, on: boolean) => void; // eslint-disable-line @typescript-eslint/method-signature-style
}

// 每次新增插件都需要修改这里
const baseVersion = '2.15',
	addons = ['highlightSelectionMatches', 'scrollPastEnd', 'useMonaco'];

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
	langs = new Set(['javascript', 'css', 'lua', 'json']),
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
	},
	avail: [string, keyof Monaco.editor.IEditorOptions | (keyof Monaco.editor.IEditorOptions)[], unknown, unknown][] = [
		['allowMultipleSelections', 'multiCursorLimit', 1, undefined],
		['autocompletion', 'quickSuggestions', false, true],
		['bracketMatching', 'matchBrackets', 'never', 'always'],
		['closeBrackets', ['autoClosingBrackets', 'autoClosingQuotes'], 'never', 'always'],
		['codeFolding', 'folding', false, true],
		['highlightActiveLine', 'renderLineHighlight', 'gutter', 'all'],
		['highlightSelectionMatches', 'occurrencesHighlight', 'off', 'singleFile'],
		['highlightSpecialChars', 'renderControlCharacters', false, true],
		['highlightWhitespace', 'renderWhitespace', 'selection', 'all'],
		['scrollPastEnd', 'scrollBeyondLastLine', false, true],
	];
let escapeActions: readonly [Monaco.editor.IActionDescriptor, Monaco.editor.IActionDescriptor] | undefined,
	wikilinkProvider: Monaco.IDisposable | undefined;

/**
 * 判断是否为普通编辑器
 * @param textarea 文本框
 */
const isEditor = (textarea: HTMLTextAreaElement): boolean => !textarea.closest('#cm-preference');

/**
 * 获取维基链接建议
 * @param api mw.Api 实例
 * @param title 页面标题
 */
const linkSuggestFactory = (api: mw.Api, title: string): ApiSuggest =>
	async (search: string, namespace = 0, subpage?: boolean) => {
		if (subpage) {
			search = title + search; // eslint-disable-line no-param-reassign
		}
		try {
			const [, pages] = await api.get({
				action: 'opensearch',
				search,
				namespace,
				limit: 'max',
			} as ApiOpenSearchParams as Record<string, string>) as [string, string[]];
			if (subpage) {
				const {length} = title;
				return pages.map(page => [page.slice(length)]);
			}
			return namespace === 0 ? pages.map(page => [page]) : pages.map(page => [new mw.Title(page).getMainText()]);
		} catch {
			return [];
		}
	};

/**
 * 获取模板参数建议
 * @param api mw.Api 实例
 * @param page 页面标题
 */
const paramSuggestFactory = (api: mw.Api, page: string): ApiSuggest => async (titles: string) => {
	/* eslint-disable no-param-reassign */
	if (titles.startsWith('/')) {
		titles = page + titles;
	}
	try {
		titles = new mw.Title(titles, 10).getPrefixedDb();
		/* eslint-enable no-param-reassign */
		const {pages} = await api.get({
				action: 'templatedata',
				titles,
				redirects: true,
				converttitles: true,
				lang: mw.config.get('wgUserLanguage'),
			} as TemplateDataApiTemplateDataParams as Record<string, string>) as {
				pages: Record<number, {params: Record<string, TemplateParam>}>;
			},
			params = Object.entries(Object.values(pages)[0]?.params || {}),
			result: ApiSuggestions = [];
		for (const [key, {aliases, label}] of params) {
			const detail = label || '';
			result.push([key, detail], ...aliases.map(alias => [alias, detail] as [string, string]));
		}
		return result;
	} catch {
		return [];
	}
};

/** 专用于MW环境的 CodeMirror 6 编辑器 */
export class CodeMirror extends CodeMirror6 {
	static version = curVersion;

	declare ns;
	#visible = true;
	#container: HTMLDivElement | undefined;
	#model: IWikitextModel | undefined;
	#editor: Monaco.editor.IStandaloneCodeEditor | undefined;
	#init;
	#indentStr = '\t';
	#escapeActions: Monaco.IDisposable[] = [];

	override get visible(): boolean {
		return this.#visible;
	}

	get model(): IWikitextModel | undefined {
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
			super.initialize(config);
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

	override initialize(config?: unknown): void {
		if (this.#model) {
			throw new Error('A Monaco editor is already initialized!');
		}
		super.initialize(config);
	}

	/** 初始化 Monaco 编辑器 */
	async #initMonaco(): Promise<void> {
		if (!('monaco' in window)) {
			await $.ajax(`${CDN}/npm/monaco-wiki/dist/all.min.js`, {dataType: 'script', cache: true});
		}
		const {textarea, lang} = this,
			language = monacoLangs[lang] || lang,
			tab = this.#indentStr.includes('\t');
		// eslint-disable-next-line @typescript-eslint/await-thenable
		await monaco;
		for (const editor of monaco.editor.getEditors()) {
			if (!editor.getDomNode()?.isConnected) {
				editor.dispose();
			}
		}
		this.#model = monaco.editor.createModel(textarea.value, language);
		this.#container = document.createElement('div');
		this.#container.className = 'monaco-container';
		this.#refresh();
		this.#container.style.minHeight = '2em';
		textarea.before(this.#container);
		textarea.style.display = 'none';
		this.#editor = monaco.editor.create(this.#container, {
			model: this.#model,
			automaticLayout: true,
			theme: 'monokai',
			readOnly: textarea.readOnly,
			wordWrap: language === 'wikitext' || language === 'html' || language === 'plaintext' ? 'on' : 'off',
			wordBreak: 'keepAll',
			tabSize: tab ? 4 : Number(this.#indentStr),
			insertSpaces: !tab,
			glyphMargin: true,
			fontSize: parseFloat(getComputedStyle(textarea).fontSize),
			unicodeHighlight: {
				ambiguousCharacters: language !== 'wikitext' && language !== 'html' && language !== 'plaintext',
			},
			multiCursorModifier: 'ctrlCmd',
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

	override async setLanguage(lang?: string, config?: unknown): Promise<void> {
		if (this.#model) {
			throw new Error('Cannot change the language of a Monaco editor!');
		} else if (lang === 'mediawiki' || lang === 'html') {
			await mw.loader.using(['mediawiki.api', 'mediawiki.Title']);
			const api = new mw.Api({parameters: {formatversion: 2}}),
				page = mw.config.get('wgPageName');
			Object.assign(config as MwConfig, {
				linkSuggest: linkSuggestFactory(api, page),
				paramSuggest: paramSuggestFactory(api, page),
			});
		}
		super.setLanguage(lang, config);
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
				opt = {...opt, i18n: languages[mw.config.get('wgUserLanguage')]};
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
						.filter(({rule, severity}) => Number(wikilint[rule]) > Number(severity === 'warning')),
				);
			} else {
				this.lint(linters[lang]);
			}
		}
	}

	override prefer(extensions: string[] | Record<string, boolean>): void {
		const hasExtension = Array.isArray(extensions)
			? (ext: string): boolean => extensions.includes(ext)
			: (ext: string): boolean | undefined => extensions[ext];
		const hasLint = hasExtension('lint'),
			hasOpenLinks = hasExtension('openLinks'),
			isWiki = this.lang === 'mediawiki';
		if (this.view) {
			super.prefer(extensions);
			if (hasLint !== undefined) {
				void this.defaultLint(hasLint);
			}
			openLinks(this, isWiki && hasOpenLinks);
			return;
		} else if (!this.#editor || !this.#model) {
			throw new Error('The editor is not initialized!');
		} else if (hasLint !== undefined && this.#model.lint) {
			this.#model.lint(hasLint);
		}
		if (isWiki) {
			const hasEscape = hasExtension('escape');
			if (hasEscape === false) {
				let action = this.#escapeActions.pop();
				while (action) {
					action.dispose();
					action = this.#escapeActions.pop();
				}
			} else if (hasEscape && this.#escapeActions.length === 0) {
				escapeActions ||= getEscapeActions();
				this.#escapeActions.push(
					this.#editor.addAction(escapeActions[0]),
					this.#editor.addAction(escapeActions[1]),
				);
			}
			if (hasOpenLinks === false) {
				wikilinkProvider?.dispose();
			} else if (hasOpenLinks) {
				wikilinkProvider ||= monaco.languages.registerLinkProvider('wikitext', linkProvider);
			}
		}
		const options: Record<string, unknown> = {};
		for (const [key, opts, off, on] of avail) {
			const has = hasExtension(key);
			if (has !== undefined) {
				if (typeof opts === 'string') {
					options[opts] = has ? on : off;
				} else {
					for (const opt of opts) {
						options[opt] = has ? on : off;
					}
				}
			}
		}
		this.#editor.updateOptions(options);
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
		const isCM = !useMonaco.has(langs.has(lang!) ? lang! : 'wiki'),
			isWiki = isCM && (lang === 'mediawiki' || lang === 'html'),
			cm = new CodeMirror(textarea, isWiki ? undefined : lang, ns, undefined, isCM);
		if (isWiki) {
			await cm.setLanguage(lang, {...await getMwConfig(), tagModes: CodeMirror.mwTagModes});
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
		const selector = '.cm-editor + textarea, .monaco-container + textarea',
			textareas = [...document.querySelectorAll<HTMLTextAreaElement>(selector)];
		void openPreference(textareas.map(textarea => instances.get(textarea)));
	});
	void welcome(baseVersion, addons);
})();

Object.assign(window, {CodeMirror6: CodeMirror});
