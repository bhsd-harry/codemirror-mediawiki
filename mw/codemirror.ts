import {CDN as baseCDN} from '@bhsd/browser';
import elt from 'crelt';
import {StateEffect} from '@codemirror/state';
import {keymap} from '@codemirror/view';
import {CodeMirror6} from '../src/codemirror';
import {baseData, isWMF} from '../src/constants';
import {
	registerCSS,
	registerHTML,
	registerJSON,
	registerJavaScript,
	registerLua,
	registerMediaWiki,
	registerVue,
	registerTheme,
	nord,
} from '../src/index';
import {jsConfig} from '../src/linter';
import {tagModes} from '../src/static';
import {getMwConfig, getParserConfig} from './config';
import {preferenceId, indentKey, themeKey, RuleState, curVersion, languageFallbacks} from './constants';
import escape from './escape';
import {
	getParsoidLintSource,
	getTemplateDataLintSource,
	getTemplateStylesLintSource,
	getScribuntoLintSource,
	getPeastLintSource,
} from './lintsource';
import {msg} from './msg';
import {getTitleParser} from './openLinks';
import {prefs, useMonaco, wikilint, codeConfigs, loadJSON, openPreference} from './preference';
import prepareSuggest from './suggest';
import {textSelection, monacoTextSelection} from './textSelection';
import {instances, templateData} from './util';
import wikiEditor, {toggleButton, setButtonActive, getGroup} from './wikiEditor';
import type {Linter} from 'eslint';
import type {Config} from 'stylelint/types/stylelint';
import type {editor, IRange} from 'monaco-editor';
import type {ConfigData} from 'wikiparser-node';
import type {Dialect, ReplaceFunction} from '../src/codemirror';
import type {Option, LiveOption} from '../src/linter';
import type {LintSources, LintSource} from '../src/lintsource';
import type {MwConfig} from '../src/token';

declare interface IWikitextModel extends editor.ITextModel {
	linter?: {
		option?: Option | LiveOption;
		lint(text: string): editor.IMarkerData[] | Promise<editor.IMarkerData[]>;
	};
	/* eslint-disable @typescript-eslint/method-signature-style */
	getRangeAt?: (start: number, end: number) => IRange;
	lint?: (this: IWikitextModel, on: boolean) => Promise<void>;
	/* eslint-enable @typescript-eslint/method-signature-style */
}

declare interface ExtCodeMirror {
	textarea: HTMLTextAreaElement;
	destroy(): void;
}

registerCSS();
registerHTML();
registerJSON();
registerJavaScript();
registerLua();
registerMediaWiki(undefined, isWMF);
registerVue();
registerTheme('dark', nord);
registerTheme('nord', nord);

const cmLinters: Record<string, LintSources | undefined> = {},
	cmLangs = new Set<string | undefined>(['javascript', 'css', 'lua', 'json', 'vue']),
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
	monacoThemes: Record<string, string> = {
		light: 'light-plus',
		dark: 'monokai',
		nord: 'nord',
	},
	cmAvail: [string, keyof editor.IEditorOptions | (keyof editor.IEditorOptions)[], unknown, unknown][] = [
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
		['hover', 'hover', {enabled: false}, undefined],
		['inlayHints', 'inlayHints', {enabled: 'offUnlessPressed'}, {enabled: 'onUnlessPressed'}],
		['openLinks', 'links', false, true],
		['scrollPastEnd', 'scrollBeyondLastLine', false, true],
		['signatureHelp', 'parameterHints', {enabled: false}, undefined],
	],
	{documentElement} = document,
	userModuleRegex = new RegExp(
		String.raw`^User:[^/]+/(?:common|global|${mw.config.get('skin')})\.js$`,
		'u',
	),
	mediaQuery = matchMedia('(prefers-color-scheme: dark)');

/**
 * 自动设置主题
 * @param cm CodeMirror 实例
 */
const setTheme = (cm: CodeMirror): void => {
	const isDark = documentElement.classList.contains('skin-theme-clientpref-night')
		|| documentElement.classList.contains('skin-theme-clientpref-os') && mediaQuery.matches
		|| documentElement.getAttribute('color-mode') === 'dark';
	cm.setTheme(isDark ? 'dark' : 'light', true);
};

/**
 * 获取主题变更 MutationObserver
 * @param cm CodeMirror 实例
 */
const getObserver = (cm: CodeMirror): MutationObserver => new MutationObserver(() => {
	setTheme(cm);
});

/**
 * 获取全部 LintSource
 * @param lang 语言
 * @param linter 基础 LintSource
 * @param more 基于 API 的 LintSource
 */
const getLintSources = (
	lang: string,
	linter: LintSource | undefined,
	more: [LintSource, ...LintSource[]],
): LintSources => {
	const lintersources: LintSources = linter ? [linter, ...more] : more;
	cmLinters[lang] = lintersources;
	return lintersources;
};

/**
 * 判断是否为 ResourceLoader 模块
 * @param title 标题
 * @param ns 命名空间
 */
const isRLModule = (title: string, ns = 2): boolean =>
	ns === 8 || ns === 2300 || ns === 2 && userModuleRegex.test(title);

/**
 * 判断是否为普通编辑器
 * @param textarea 文本框
 */
const isEditor = (textarea: HTMLTextAreaElement): boolean => !textarea.closest(`#${preferenceId}`);

/**
 * 抛出重复初始化错误
 * @throws `RangeError` 重复初始化
 */
const throwInitError = (): never => {
	throw new RangeError('The textarea has already been replaced by CodeMirror.');
};

/** 专用于MW环境的 CodeMirror 6 编辑器 */
export class CodeMirror extends CodeMirror6 {
	static readonly version = curVersion;
	static readonly instances = instances;
	declare static monacoVersion: string | undefined;

	declare ns;
	declare page;
	declare $textarea;
	#visible = true;
	#container: HTMLElement | undefined;
	#model: IWikitextModel | undefined;
	#editor: editor.IStandaloneCodeEditor | undefined;
	#init: Promise<void> | undefined;
	#indentStr = '\t';
	#handler;
	#observer: MutationObserver | undefined;
	#listener = (): void => {
		setTheme(this);
	};

	override get visible(): boolean {
		return this.#visible && this.textarea.isConnected;
	}

	get model(): IWikitextModel | undefined {
		return this.#model;
	}

	get editor(): editor.IStandaloneCodeEditor | undefined {
		return this.#editor;
	}

	get $toolbar(): JQuery | undefined {
		return (this.$textarea.data('wikiEditorContext') as WikiEditorContext | undefined)
			?.modules.toolbar.$toolbar;
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
		if (instances.get(textarea)) {
			throwInitError();
		}
		const handler = (obj: ExtCodeMirror): void => {
			if (obj.textarea === textarea) {
				obj.destroy();
			}
		};
		mw.hook('ext.CodeMirror.ready').add(handler);
		super(textarea, lang, config, false);
		this.ns = ns;
		this.page = page;
		this.$textarea = $(textarea);
		this.#handler = handler;
		instances.set(textarea, this);
		this.initialize(config, !isCM);
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

	/**
	 * 更新基于API的自动补全设置
	 * @param config 语言设置
	 */
	#setLangConfig(config: MwConfig): void {
		if (this.lang === 'mediawiki') {
			mw.loader.load('mediawiki.Title');
			this.langConfig = $.extend(
				true,
				{
					titleParser: getTitleParser(config),
					articlePath: mw.config.get('wgArticlePath'),
				},
				config,
			);
		}
		// 继承编辑字体
		const font = [...this.textarea.classList].find(cls => cls.startsWith('mw-editfont-'));
		if (font) {
			this.view!.contentDOM.classList.toggle(font, this.lang === 'mediawiki' || this.lang === 'plain');
		}
	}

	override initialize(config?: unknown, monaco?: boolean): void {
		if (this.#model) {
			throw new Error('A Monaco editor is already initialized!');
		} else if (monaco) {
			this.#init = this.#initMonaco();
			this.$textarea.data('jquery.textSelection', monacoTextSelection);
			return;
		}
		super.initialize(config);
		this.view!.dispatch({
			effects: StateEffect.appendConfig.of(
				keymap.of([
					{
						key: 'Mod-Shift-,',
						run(): boolean {
							void openPreference();
							return true;
						},
					},
				]),
			),
		});
		this.#setLangConfig(config as MwConfig);
		toggleButton(this.$toolbar, 'lineWrapping', true);
	}

	/** 初始化 Monaco 编辑器 */
	async #initMonaco(): Promise<void> {
		if (typeof monaco !== 'object' || typeof monaco.editor !== 'object') {
			const CDN = baseData.CDN || baseCDN;
			Object.assign(globalThis, {monaco: {CDN}});
			await $.ajax(
				`${CDN}/npm/monaco-wiki@${CodeMirror.monacoVersion ?? 'latest'}/dist/all.min.js`,
				{dataType: 'script', cache: true},
			);
		}
		const {textarea, lang} = this,
			language = monacoLangs[lang] ?? lang,
			isWiki = language === 'wikitext',
			wrapping = isWiki || language === 'html' || language === 'plaintext',
			tab = this.#indentStr.includes('\t'),
			container = 'monaco-container';
		await monaco; // eslint-disable-line @typescript-eslint/await-thenable
		for (const editor of monaco.editor.getEditors()) {
			if (editor.getContainerDomNode().classList.contains(container) && !editor.getDomNode()?.isConnected) {
				editor.getModel()?.dispose();
				editor.dispose();
			}
		}
		this.#model = monaco.editor.createModel(textarea.value, language);
		this.#container = elt('div', {class: container});
		this.#refresh();
		textarea.before(this.#container);
		textarea.style.display = 'none';
		this.#editor = monaco.editor.create(this.#container, {
			model: this.#model,
			automaticLayout: true,
			theme: 'monokai',
			readOnly: textarea.readOnly,
			wordWrap: wrapping ? 'on' : 'off',
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
		// eslint-disable-next-line no-bitwise
		this.#editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Comma, () => {
			void openPreference();
		});
		let timer: NodeJS.Timeout;
		this.#model.onDidChangeContent(() => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				textarea.value = this.#model!.getValue();
			}, 400);
		});
		toggleButton(this.$toolbar, 'lineWrapping', wrapping);
	}

	/** 刷新 Monaco 编辑器高度 */
	#refresh(): void {
		const {offsetHeight, style: {height}} = this.textarea;
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
		setButtonActive(this.$toolbar, show);
	}

	override destroy(): void {
		if (this.visible) {
			this.toggle(false);
		}
		if (this.#editor) {
			this.#editor.dispose();
			this.#model!.dispose();
			this.#container!.remove();
		}
		this.$textarea.data('CodeMirror6', null);
		this.$toolbar?.removeClass(['readonly', 'wiki', 'coding'].map(s => `codemirror-${s}`).join(' '))
			.find(getGroup(['', 'format', 'more', 'search']))
			.remove();
		mw.hook('ext.CodeMirror.ready').remove(this.#handler);
		this.#removeThemeListener();
		super.destroy();
	}

	override async setLanguage(lang?: string, config?: unknown): Promise<void> {
		if (this.#model) {
			throw new Error('Cannot change the language of a Monaco editor!');
		}
		const isWiki = lang === 'mediawiki' || lang === 'html';
		if (isWiki) {
			config ??= this.langConfig;
			Object.assign(config as MwConfig, await prepareSuggest(this.page));
		}
		void super.setLanguage(lang, config);
		this.#setLangConfig(config as MwConfig);
		this.$toolbar?.toggleClass('codemirror-coding', !isWiki);
	}

	override setContent(content: string, force?: boolean): void {
		if (this.#model) {
			this.#model.setValue(content);
		} else {
			super.setContent(content, force);
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

	override setLineWrapping(wrapping: boolean): void {
		if (this.#editor) {
			this.#editor.updateOptions({wordWrap: wrapping ? 'on' : 'off'});
		} else {
			super.setLineWrapping(wrapping);
		}
		toggleButton(this.$toolbar, 'lineWrapping', wrapping);
	}

	// @ts-expect-error override return type
	override async getLinter(opt?: Option | LiveOption): Promise<LintSources | undefined> {
		const {view, lang, dialect, page, ns} = this;
		if (view) {
			const linter = await super.getLinter(opt);
			if (isWMF) {
				switch (lang) {
					case 'mediawiki':
						return getLintSources(lang, linter, [
							await getParsoidLintSource(page, opt),
							await getTemplateDataLintSource(this, opt),
						]);
					case 'lua':
						return getLintSources(lang, linter, [await getScribuntoLintSource(page)]);
					case 'css':
						if (dialect === 'sanitized-css') {
							return getLintSources(lang, linter, [await getTemplateStylesLintSource(page)]);
						}
						break;
					case 'javascript':
						if (isRLModule(page, ns)) {
							return getLintSources(lang, linter, [await getPeastLintSource(page)]);
						}
					// no default
				}
			}
			cmLinters[lang] = linter;
			return linter;
		} else if (this.#model?.linter) {
			this.#model.linter.option = opt;
		}
		return undefined;
	}

	/**
	 * 获取基础 linter 选项
	 * @param lang 语言
	 * @param i18n I18n 语言列表
	 */
	#getBasicOpt(lang: string, i18n?: string[]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
		switch (lang) {
			case 'javascript':
				return {...jsConfig, ...codeConfigs.get('ESLint')};
			case 'css':
				return codeConfigs.get('Stylelint');
			case 'mediawiki':
				return i18n
					? {getConfig: this.getWikiConfig, i18n}
					: {defaultSeverity: RuleState.error, ...wikilint, css: this.#getBasicOpt('css')};
			default:
				return undefined;
		}
	}

	/**
	 * 添加或移除默认 linter
	 * @param on 是否添加
	 */
	async defaultLint(on: boolean): Promise<void> {
		if (!on) {
			if (this.view) {
				this.lint();
			} else if (this.#model?.lint) {
				void this.#model.lint(false);
			}
			return;
		}
		const {lang, ns, dialect, page} = this,
			loaded = lang in cmLinters;
		if (!loaded) {
			let defaultOpt: Option;
			if (typeof ns === 'number') {
				if (lang === 'mediawiki' && ns !== 10 && ns !== 828 && ns !== 2) {
					defaultOpt = {include: false};
				} else if (lang === 'javascript') {
					defaultOpt = (
						isRLModule(page, ns) ? {parserOptions: {ecmaVersion: 8}} : {}
					) satisfies Linter.BaseConfig;
				}
			}
			let opt: LiveOption | undefined;
			switch (lang) {
				case 'mediawiki': {
					const option = {...defaultOpt, ...this.#getBasicOpt(lang, await languageFallbacks)};
					opt = (runtime): Option => runtime ? this.#getBasicOpt(lang) : option;
					break;
				}
				case 'javascript':
					opt = (): Option => ({...defaultOpt, ...this.#getBasicOpt(lang)});
					break;
				case 'css':
					opt = (): Option => {
						const option: Config | undefined = this.#getBasicOpt(lang);
						if (dialect === 'sanitized-css') {
							const rules = option?.rules;
							return {
								...option,
								rules: {
									...rules,
									'property-no-vendor-prefix': [
										true,
										{
											ignoreProperties: ['user-select'],
										},
									],
									'property-disallowed-list': [
										...(rules?.['property-disallowed-list'] as string[] | undefined) ?? [],
										'/^--/',
									],
								},
							};
						}
						return option;
					};
					break;
				case 'vue':
					opt = (): Option => ({
						js: this.#getBasicOpt('javascript'),
						css: this.#getBasicOpt('css'),
					});
					break;
				case 'html': {
					const option = this.#getBasicOpt('mediawiki', await languageFallbacks);
					opt = (runtime): Option => runtime
						? {
							wiki: this.#getBasicOpt('mediawiki'),
							js: this.#getBasicOpt('javascript'),
							css: this.#getBasicOpt('css'),
						}
						: option;
				}
				// no default
			}
			await this.getLinter(opt);
		}
		if (this.view) {
			this.lint(cmLinters[lang]);
		} else if (this.#model?.lint) {
			/** @todo 动态更新 `this.#model.linter.lint` */
			void this.#model.lint(true);
		}
	}

	// @ts-expect-error convert a function property to a method
	override async getWikiConfig(this: void): Promise<ConfigData> {
		const [mwConfig, minConfig] = await Promise.all([getMwConfig(tagModes), wikiparse.getConfig()]);
		return getParserConfig(minConfig, mwConfig);
	}

	override prefer(extensions: string[] | Record<string, boolean>): void {
		if (!isEditor(this.textarea) && Array.isArray(extensions)) {
			extensions = extensions.filter(ext => ext !== 'scrollPastEnd');
		}
		const hasExtension = Array.isArray(extensions)
			? (ext: string): boolean => extensions.includes(ext)
			: (ext: string): boolean | undefined => extensions[ext];
		const hasLint = hasExtension('lint'),
			hasSpecialChars = hasExtension('highlightSpecialChars') && hasExtension('highlightWhitespace'),
			autocompletion = hasExtension('autocompletion'),
			isWiki = this.lang === 'mediawiki';
		if (hasLint !== undefined) {
			void this.defaultLint(hasLint);
		}
		if (hasSpecialChars !== undefined) {
			toggleButton(this.$toolbar, 'invisibleChars', hasSpecialChars);
		}
		if (autocompletion !== undefined) {
			toggleButton(this.$toolbar, 'autocomplete', autocompletion);
		}
		if (this.view) {
			super.prefer(extensions);
			return;
		} else if (!this.#editor || !this.#model) {
			throw new Error('The editor is not initialized!');
		}
		if (isWiki) {
			escape(this.#editor, hasExtension('escape'));
		}
		const options: Record<string, unknown> = {};
		for (const [key, opts, off, on] of cmAvail) {
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

	#removeThemeListener(): void {
		this.#observer?.disconnect();
		mediaQuery.removeEventListener('change', this.#listener);
	}

	override setTheme(theme: string, auto?: boolean): void {
		if (theme === 'auto') {
			this.#observer ??= getObserver(this);
			this.#observer.observe(documentElement, {attributes: true, attributeFilter: ['class', 'color-mode']});
			mediaQuery.addEventListener('change', this.#listener);
			setTheme(this);
			return;
		} else if (!auto) {
			this.#removeThemeListener();
		}
		if (this.#editor) {
			this.#editor.updateOptions({theme: monacoThemes[theme] ?? theme});
			return;
		}
		super.setTheme(
			mw.config.get('skin') === 'moeskin'
			&& mw.loader.getState('ext.CodeMirror.v6') === 'ready'
				? 'light'
				: theme,
		);
	}

	override replaceSelections(func: ReplaceFunction): void {
		if (this.#editor) {
			const edits = this.#editor.getSelections()!.map((range): editor.ISingleEditOperation => {
				const result = func(this.#model!.getValueInRange(range), {
					from: this.#model!.getOffsetAt(range.getStartPosition()),
					to: this.#model!.getOffsetAt(range.getEndPosition()),
				});
				return {range, text: typeof result === 'string' ? result : result[0]};
			});
			this.#editor.executeEdits('replaceSelection', edits);
			return;
		}
		super.replaceSelections(func);
	}

	/**
	 * 将 textarea 替换为 CodeMirror
	 * @param textarea textarea 元素
	 * @param lang 语言
	 * @param ns 命名空间
	 * @param page 页面标题
	 * @param extensions 扩展名列表
	 */
	static async fromTextArea(
		textarea: HTMLTextAreaElement,
		lang?: string,
		ns?: number,
		page?: string,
		extensions: string[] = [],
	): Promise<CodeMirror> {
		if (instances.has(textarea)) {
			throwInitError();
		}
		instances.set(textarea, undefined);
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
			allPrefs = [...prefs, ...extensions],
			isWiki = lang === 'mediawiki' || lang === 'html';
		if (
			$textarea.data('wikiEditorContext')
			|| allPrefs.includes('wikiEditor') && isEditor(textarea)
		) {
			try {
				await wikiEditor($textarea, textarea.readOnly, isWiki);
			} catch (e) {
				if (e instanceof Error && e.message === 'no-wikiEditor') {
					void mw.notify(msg(e.message), {type: 'error'});
				}
				prefs.delete('wikiEditor');
			}
		}
		const isCM = !useMonaco.has(cmLangs.has(lang) ? lang! : 'wiki'),
			isCMWiki = isCM && isWiki,
			cm = new CodeMirror(textarea, isCMWiki ? undefined : lang, ns, dialect, isCM, page);
		cm.dialect = dialect;
		$textarea.data('CodeMirror6', cm);
		if (isCMWiki) {
			await cm.setLanguage(lang, await getMwConfig(tagModes));
		}
		await Promise.all([loadJSON, cm.#init]);
		cm.prefer(allPrefs);
		const indent = localStorage.getItem(indentKey),
			theme = localStorage.getItem(themeKey);
		if (indent) {
			cm.setIndent(indent);
		}
		if (theme) {
			cm.setTheme(theme);
		}
		return cm;
	}
}

Object.assign(CodeMirror, {templateData});
