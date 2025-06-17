import {CDN} from '@bhsd/common';
import {CodeMirror6} from '../src/codemirror';
import {tagModes} from '../src/static';
import {getMwConfig, getParserConfig} from './config';
import {getTitleParser, isbnParser} from './openLinks';
import {instances, textSelection, monacoTextSelection} from './textSelection';
import {prefs, useMonaco, indentKey, wikilint, codeConfigs, loadJSON} from './preference';
import {msg, curVersion, languages} from './msg';
import prepareSuggest from './suggest';
import escape from './escape';
import wikiEditor from './wikiEditor';
import type {Linter} from 'eslint';
import type * as Monaco from 'monaco-editor';
import type {editor} from 'monaco-editor';
import type {ConfigData} from 'wikiparser-node';
import type {LintSource, MwConfig, Dialect} from '../src/codemirror';
import type {Option, LiveOption} from '../src/linter';
import type {WikiEditorContext} from './wikiEditor';

declare global {
	const monaco: typeof Monaco;
}

declare interface IWikitextModel extends editor.ITextModel {
	lint?: (this: IWikitextModel, on: boolean) => void; // eslint-disable-line @typescript-eslint/method-signature-style
}

const linters: Record<string, LintSource | undefined> = {},
	langs = new Set<string | undefined>(['javascript', 'css', 'lua', 'json']),
	langMap: Record<string, string> = {
		'sanitized-css': 'css',
		js: 'javascript',
		scribunto: 'lua',
		wikitext: 'mediawiki',
		'proofread-page': 'mediawiki',
	},
	monacoLangs: Record<string, string> = {
		mediawiki: 'wikitext',
		template: 'wikitext',
		gadget: 'javascript',
		plain: 'plaintext',
	},
	avail: [string, keyof editor.IEditorOptions | (keyof editor.IEditorOptions)[], unknown, unknown][] = [
		['allowMultipleSelections', 'multiCursorLimit', 1, undefined],
		['autocompletion', 'quickSuggestions', false, true],
		['bracketMatching', 'matchBrackets', 'never', 'always'],
		['closeBrackets', ['autoClosingBrackets', 'autoClosingQuotes'], 'never', 'always'],
		['codeFolding', 'folding', false, true],
		['colorPicker', 'colorDecorators', false, true],
		['highlightActiveLine', 'renderLineHighlight', 'gutter', 'all'],
		['highlightSelectionMatches', 'occurrencesHighlight', 'off', 'singleFile'],
		['highlightSpecialChars', 'renderControlCharacters', false, true],
		['highlightWhitespace', 'renderWhitespace', 'selection', 'all'],
		['openLinks', 'links', false, true],
		['scrollPastEnd', 'scrollBeyondLastLine', false, true],
		['hover', 'hover', {enabled: false}, undefined],
		['signatureHelp', 'parameterHints', {enabled: false}, undefined],
		['inlayHints', 'inlayHints', {enabled: 'offUnlessPressed'}, {enabled: 'onUnlessPressed'}],
	];

/**
 * 判断是否为普通编辑器
 * @param textarea 文本框
 */
const isEditor = (textarea: HTMLTextAreaElement): boolean => !textarea.closest('#cm-preference');

/** 专用于MW环境的 CodeMirror 6 编辑器 */
export class CodeMirror extends CodeMirror6 {
	static readonly version = curVersion;

	declare ns;
	declare page;
	declare $textarea;
	#visible = true;
	#container: HTMLDivElement | undefined;
	#model: IWikitextModel | undefined;
	#editor: editor.IStandaloneCodeEditor | undefined;
	readonly #init;
	#indentStr = '\t';

	override get visible(): boolean {
		return this.#visible;
	}

	get model(): IWikitextModel | undefined {
		return this.#model;
	}

	get editor(): editor.IStandaloneCodeEditor | undefined {
		return this.#editor;
	}

	/**
	 * @param textarea 文本框
	 * @param lang 语言
	 * @param ns 命名空间
	 * @param config 语言设置
	 * @param isCM 是否使用 CodeMirror
	 * @param page 页面标题
	 */
	constructor(
		textarea: HTMLTextAreaElement,
		lang?: string,
		ns?: number,
		config?: unknown,
		isCM = true,
		page = mw.config.get('wgPageName'),
	) {
		if (instances.has(textarea)) {
			throw new RangeError('The textarea has already been replaced by CodeMirror.');
		} else if (textarea.id === 'wpTextbox1') {
			mw.hook('ext.CodeMirror.ready').add((obj: {destroy(): void}) => {
				obj.destroy();
			});
		}
		super(textarea, lang, config, false);
		this.ns = ns;
		this.page = page;
		this.$textarea = $(textarea);
		instances.set(textarea, this);
		if (isCM) {
			this.initialize(config);
		} else {
			this.#init = this.#initMonaco();
			this.$textarea.data('jquery.textSelection', monacoTextSelection);
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
		} else {
			mw.hook('wiki-codemirror6.setting').fire(this);
		}
	}

	#setLangConfig(config: MwConfig): void {
		if (this.lang === 'mediawiki') {
			this.langConfig = $.extend(true, {titleParser: getTitleParser(config), isbnParser}, config);
		}
	}

	override initialize(config?: unknown): void {
		if (this.#model) {
			throw new Error('A Monaco editor is already initialized!');
		}
		super.initialize(config);
		this.#setLangConfig(config as MwConfig);
		const font = [...this.textarea.classList].find(cls => cls.startsWith('mw-editfont-'));
		if (font) {
			this.view!.contentDOM.classList.add(font);
		}
	}

	/** 初始化 Monaco 编辑器 */
	async #initMonaco(): Promise<void> {
		if (typeof monaco !== 'object') {
			await $.ajax(
				`${CDN}/npm/monaco-wiki@${mw.libs.wphl?.monacoVersion ?? 'latest'}/dist/all.min.js`,
				{dataType: 'script', cache: true},
			);
		}
		const {textarea, lang} = this,
			language = monacoLangs[lang] ?? lang,
			isWiki = language === 'wikitext',
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
		textarea.before(this.#container);
		textarea.style.display = 'none';
		this.#editor = monaco.editor.create(this.#container, {
			model: this.#model,
			automaticLayout: true,
			theme: 'monokai',
			readOnly: textarea.readOnly,
			wordWrap: isWiki || language === 'html' || language === 'plaintext' ? 'on' : 'off',
			wordBreak: 'keepAll',
			tabSize: tab ? 4 : Number(this.#indentStr),
			insertSpaces: !tab,
			glyphMargin: true,
			fontSize: parseFloat(getComputedStyle(textarea).fontSize),
			unicodeHighlight: {
				ambiguousCharacters: !isWiki && language !== 'html' && language !== 'plaintext',
			},
			multiCursorModifier: 'ctrlCmd',
		});
		let timer: NodeJS.Timeout;
		this.#model.onDidChangeContent(() => {
			clearTimeout(timer);
			timer = setTimeout(() => {
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
		const {textarea, $textarea} = this;
		if (!this.#model) {
			super.toggle(show);
			$textarea.data('jquery.textSelection', show && textSelection);
		} else if (show && !this.#visible) {
			this.#model.setValue(textarea.value);
			this.#refresh();
			this.#container!.style.display = '';
			textarea.style.display = 'none';
			$textarea.data('jquery.textSelection', monacoTextSelection);
		} else if (!show && this.#visible) {
			this.#container!.style.display = 'none';
			textarea.style.display = '';
			$textarea.removeData('jquery.textSelection');
		}
		this.#visible = show;
	}

	override async setLanguage(lang?: string, config?: unknown): Promise<void> {
		if (this.#model) {
			throw new Error('Cannot change the language of a Monaco editor!');
		}
		const isWiki = lang === 'mediawiki' || lang === 'html';
		if (isWiki) {
			Object.assign(config as MwConfig, await prepareSuggest(this.page));
		}
		void super.setLanguage(lang, config);
		this.#setLangConfig(config as MwConfig);
		(this.$textarea.data('wikiEditorContext') as WikiEditorContext | undefined)
			?.modules.toolbar.$toolbar.toggleClass('codemirror-coding', !isWiki);
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

	override async getLinter(opt?: Option | LiveOption): Promise<LintSource | undefined> {
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
			loaded = lang in linters,
			isWiki = lang === 'mediawiki';
		let opt: Option | LiveOption,
			defaultOpt: Option;
		if (typeof optOrNs === 'number') {
			if (isWiki && optOrNs !== 10 && optOrNs !== 828 && optOrNs !== 2) {
				defaultOpt = {include: false};
			} else if (lang === 'javascript') {
				defaultOpt = {
					env: {browser: true, es2024: true, jquery: true},
					globals: {
						mw: 'readonly',
						mediaWiki: 'readonly',
						OO: 'readonly',
						addOnloadHook: 'readonly',
						importScriptURI: 'readonly',
						importScript: 'readonly',
						importStylesheet: 'readonly',
						importStylesheetURI: 'readonly',
					},
					...optOrNs === 8 || optOrNs === 2300 ? {parserOptions: {ecmaVersion: 8}} : {},
				} satisfies Linter.Config;
			}
		} else {
			opt = optOrNs;
		}
		if (opt || !loaded) {
			if (isWiki) {
				const extra = {getConfig: this.getWikiConfig, i18n: languages};
				opt = opt
					? {...extra, ...opt as Option}
					: (runtime): Option => ({...extra, ...runtime ? wikilint : defaultOpt});
			} else if (lang === 'javascript') {
				opt ??= (): Option => ({...defaultOpt, ...codeConfigs.get('ESLint')});
			} else if (lang === 'css') {
				opt ??= (): Option => codeConfigs.get('Stylelint');
			}
			await this.getLinter(opt);
		}
		if (linters[lang]) {
			this.lint(linters[lang]);
		}
	}

	// eslint-disable-next-line @typescript-eslint/class-methods-use-this
	// @ts-expect-error convert a function property to a method
	override async getWikiConfig(this: void): Promise<ConfigData> {
		const [mwConfig, minConfig] = await Promise.all([getMwConfig(tagModes), wikiparse.getConfig()]);
		return getParserConfig(minConfig, mwConfig);
	}

	override prefer(extensions: string[] | Record<string, boolean>): void {
		if (!isEditor(this.textarea) && Array.isArray(extensions)) {
			extensions = extensions.filter(ext => ext !== 'scrollPastEnd'); // eslint-disable-line no-param-reassign
		}
		const hasExtension = Array.isArray(extensions)
			? (ext: string): boolean => extensions.includes(ext)
			: (ext: string): boolean | undefined => extensions[ext];
		const hasLint = hasExtension('lint'),
			isWiki = this.lang === 'mediawiki';
		if (this.view) {
			super.prefer(extensions);
			if (hasLint !== undefined) {
				void this.defaultLint(hasLint);
			}
			return;
		} else if (!this.#editor || !this.#model) {
			throw new Error('The editor is not initialized!');
		} else if (hasLint !== undefined && this.#model.lint) {
			this.#model.lint(hasLint);
		}
		if (isWiki) {
			escape(this.#editor, hasExtension('escape'));
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
	 * @param page 页面标题
	 */
	static async fromTextArea(
		textarea: HTMLTextAreaElement,
		lang?: string,
		ns?: number,
		page?: string,
	): Promise<CodeMirror> {
		/* eslint-disable no-param-reassign */
		if (!lang && ns === undefined) {
			const {wgAction, wgNamespaceNumber, wgPageContentModel, wgCanonicalSpecialPageName} = mw.config.get();
			if (wgAction === 'edit' || wgAction === 'submit') {
				ns = wgNamespaceNumber;
				lang = wgNamespaceNumber === 274 ? 'html' : wgPageContentModel.toLowerCase();
			} else if (wgCanonicalSpecialPageName === 'Upload') {
				ns = 6;
				lang = 'wikitext';
			} else if (wgCanonicalSpecialPageName === 'ExpandTemplates' && textarea.name === 'wpInput') {
				ns = 0;
				lang = 'wikitext';
			} else {
				await mw.loader.using('oojs-ui-windows');
				lang = (await OO.ui.prompt(msg('contentmodel')) || undefined)?.toLowerCase();
			}
		}
		let dialect: Dialect;
		if (lang && lang in langMap) {
			if (lang === 'sanitized-css') {
				dialect = lang;
			}
			lang = langMap[lang];
		}
		const $textarea = $(textarea),
			isWiki = lang === 'mediawiki' || lang === 'html';
		if (prefs.has('wikiEditor') && isEditor(textarea)) {
			try {
				await wikiEditor($textarea, textarea.readOnly, isWiki);
			} catch (e) {
				if (e instanceof Error && e.message === 'no-wikiEditor') {
					void mw.notify(msg(e.message), {type: 'error'});
				}
				prefs.delete('wikiEditor');
			}
		}
		/* eslint-enable no-param-reassign */
		const isCM = !useMonaco.has(langs.has(lang) ? lang! : 'wiki'),
			isCMWiki = isCM && isWiki,
			cm = new CodeMirror(textarea, isCMWiki ? undefined : lang, ns, dialect, isCM, page);
		cm.dialect = dialect;
		$textarea.data('CodeMirror6', cm);
		if (isCMWiki) {
			await cm.setLanguage(lang, await getMwConfig(tagModes));
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
