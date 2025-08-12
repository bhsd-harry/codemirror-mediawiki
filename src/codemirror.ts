import {
	EditorView,
	lineNumbers,
	keymap,
	highlightSpecialChars,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightWhitespace,
	highlightTrailingWhitespace,
	drawSelection,
	scrollPastEnd,
	rectangularSelection,
	crosshairCursor,
} from '@codemirror/view';
import {Compartment, EditorState, EditorSelection, SelectionRange} from '@codemirror/state';
import {
	syntaxHighlighting,
	defaultHighlightStyle,
	indentOnInput,
	indentUnit,
	ensureSyntaxTree,
} from '@codemirror/language';
import {defaultKeymap, historyKeymap, history, redo, indentWithTab} from '@codemirror/commands';
import {searchKeymap, highlightSelectionMatches} from '@codemirror/search';
import {linter, lintGutter, lintKeymap} from '@codemirror/lint';
import {
	closeBrackets,
	autocompletion,
	acceptCompletion,
	completionKeymap,
	startCompletion,
} from '@codemirror/autocomplete';
import {json} from '@codemirror/lang-json';
import {autoCloseTags} from '@codemirror/lang-html';
import {css as cssParser} from '@codemirror/legacy-modes/mode/css';
import {getLSP} from '@bhsd/browser';
import {colorPicker as cssColorPicker, colorPickerTheme, makeColorPicker} from '@bhsd/codemirror-css-color-picker';
import colorPicker, {discoverColors} from './color';
import {mediawiki, html, FullMediaWiki} from './mediawiki';
import escape from './escape';
import codeFolding, {foldHandler, mediaWikiFold} from './fold';
import tagMatchingState from './matchTag';
import refHover from './ref';
import magicWordHover from './hover';
import signatureHelp from './signature';
import inlayHints from './inlay';
import {
	getWikiLintSource,
	getJsLintSource,
	getCssLintSource,
	getJsonLintSource,
	getLuaLintSource,
	getVueLintSource,
} from './lintsource';
import openLinks from './openLinks';
import {tagModes, getStaticMwConfig} from './static';
import bidiIsolation from './bidi';
import toolKeymap from './keymap';
import statusBar from './statusBar';
import {detectIndent} from './indent';
import bracketMatching from './matchBrackets';
import javascript from './javascript';
import css from './css';
import lua from './lua';
import vue from './vue';
import type {ViewPlugin, KeyBinding} from '@codemirror/view';
import type {Extension, StateEffect} from '@codemirror/state';
import type {Config, LanguageSupport} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import type {StyleSpec} from 'style-mod';
import type {ConfigData} from 'wikiparser-node';
import type {MwConfig} from './token';
import type {DocRange} from './fold';
import type {Option, LiveOption} from './linter';
import type {LintSource, LintSourceGetter} from './lintsource';
import type {Text as ExtendedText} from './indent';

export type {MwConfig};
export type Addon<T> = [(config?: T, cm?: CodeMirror6) => Extension, Record<string, T>?];
export type Dialect = 'sanitized-css' | undefined;

declare type LintExtension = [unknown, ViewPlugin<{set: boolean, force(): void}>];

const plain = (): Extension => EditorView.contentAttributes.of({spellcheck: 'true'});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const languages: Record<string, (config?: any) => Extension> = {plain};

/**
 * 仅供mediawiki模式的扩展
 * @param ext 扩展
 */
function mediawikiOnly(ext: Extension): Addon<Extension>;
function mediawikiOnly(ext: (cm: CodeMirror6) => Extension): Addon<boolean>;
function mediawikiOnly(ext: Extension | ((cm: CodeMirror6) => Extension)): Addon<Extension> | Addon<boolean> {
	return typeof ext === 'function'
		? [(enable: boolean, cm): Extension => enable ? ext(cm!) : [], {mediawiki: true}] as Addon<boolean>
		: [(e: Extension = []): Extension => e, {mediawiki: ext}];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const avail: Record<string, Addon<any>> = {
	highlightSpecialChars: [highlightSpecialChars],
	highlightActiveLine: [highlightActiveLine],
	highlightWhitespace: [highlightWhitespace],
	highlightTrailingWhitespace: [highlightTrailingWhitespace],
	highlightSelectionMatches: [highlightSelectionMatches],
	bracketMatching: [
		([config, e = []]: [Config?, Extension?] = []): Extension => [
			bracketMatching(config),
			e,
		],
	] satisfies Addon<[Config?, Extension?]>,
	closeBrackets: [(e: Extension = []): Extension => [closeBrackets(), e]] satisfies Addon<Extension>,
	scrollPastEnd: [scrollPastEnd],
	allowMultipleSelections: [
		(): Extension => [
			EditorState.allowMultipleSelections.of(true),
			drawSelection(),
			rectangularSelection(),
			crosshairCursor(),
		],
	],
	autocompletion: [
		(): Extension => [
			autocompletion({defaultKeymap: false}),
			keymap.of([
				...completionKeymap.filter(({run}) => run !== startCompletion),
				{key: 'Shift-Enter', run: startCompletion},
				{key: 'Tab', run: acceptCompletion},
			]),
		],
	],
	codeFolding,
	colorPicker,
};

const linterRegistry: Record<string, LintSourceGetter> = {};

const destroyListeners: ((view: EditorView) => void)[] = [];

const editExtensions = new Set(['closeBrackets', 'autocompletion', 'signatureHelp']);

const linters: Record<string, Extension> = {};
const phrases: Record<string, string> = {};

/**
 * 注册特定语言的扩展
 * @param lang 语言
 * @param name 扩展名
 * @param ext 扩展
 */
const registerLangExtension = <T = Extension>(lang: string, name: string, ext: T): void => {
	const addon = avail[name] as Addon<T>;
	addon[1] ??= {};
	addon[1][lang] = ext;
};

/** Register MediaWiki language support */
export const registerMediaWiki = (): void => {
	languages['mediawiki'] = (config: MwConfig): Extension => [
		mediawiki(config),
		plain(),
		bidiIsolation,
		toolKeymap,
	];
	registerLangExtension<[Extension, StyleSpec]>('mediawiki', 'colorPicker', [
		[makeColorPicker({discoverColors}), colorPickerTheme],
		{marginLeft: '0.6ch'},
	]);
	registerLangExtension<[Config, Extension]>('mediawiki', 'bracketMatching', [
		{brackets: '()[]{}（）【】［］｛｝'},
		tagMatchingState,
	]);
	registerLangExtension('mediawiki', 'codeFolding', mediaWikiFold);
	Object.assign(avail, {
		openLinks: mediawikiOnly(openLinks),
		escape: mediawikiOnly(escape),
		refHover: mediawikiOnly(refHover),
		hover: mediawikiOnly(magicWordHover),
		signatureHelp: mediawikiOnly(signatureHelp),
		inlayHints: mediawikiOnly(inlayHints),
	});
	linterRegistry['mediawiki'] = getWikiLintSource;
	destroyListeners.push(view => getLSP(view)?.destroy());
};

/** Register mixed MediaWiki-HTML language support */
export const registerHTML = (): void => {
	Object.assign(FullMediaWiki.prototype, {
		css() {
			return cssParser;
		},
	});
	languages['html'] = html;
};

/** Register JavaScript language support */
export const registerJavaScript = (): void => {
	languages['javascript'] = javascript;
	linterRegistry['javascript'] = getJsLintSource;
};

/** Register CSS language support */
export const registerCSS = (): void => {
	languages['css'] = css;
	registerLangExtension<[Extension]>('css', 'colorPicker', [cssColorPicker]);
	linterRegistry['css'] = getCssLintSource;
};

/** Register JSON language support */
export const registerJSON = (): void => {
	languages['json'] = json;
	linterRegistry['json'] = getJsonLintSource;
};

/** Register Lua language support */
export const registerLua = (): void => {
	languages['lua'] = lua;
	linterRegistry['lua'] = getLuaLintSource;
};

/** Register Vue language support */
export const registerVue = (): void => {
	languages['vue'] = vue;
	registerLangExtension('vue', 'closeBrackets', autoCloseTags);
	registerLangExtension<[Extension]>('vue', 'colorPicker', [cssColorPicker]);
	linterRegistry['vue'] = getVueLintSource;
};

/**
 * Register a custom language support
 * @param name language name
 * @param lang language support
 * @param lintSource optional linter
 */
export const registerLanguage = (
	name: string,
	lang: (config?: unknown) => LanguageSupport,
	lintSource?: LintSourceGetter,
): void => {
	languages[name] = lang;
	if (lintSource) {
		linterRegistry[name] = lintSource;
	}
};

/** CodeMirror 6 editor */
export class CodeMirror6 {
	/** only for sanitized-css */
	declare dialect: Dialect;
	declare getWikiConfig?: () => Promise<ConfigData>;
	declare langConfig: MwConfig | undefined;
	readonly #textarea;
	readonly #language = new Compartment();
	readonly #linter = new Compartment();
	readonly #extensions = new Compartment();
	readonly #dir = new Compartment();
	readonly #indent = new Compartment();
	readonly #extraKeys = new Compartment();
	readonly #phrases = new Compartment();
	readonly #lineWrapping = new Compartment();
	#view: EditorView | undefined;
	#lang;
	#visible = false;
	#preferred = new Set<string>();
	#indentStr = '\t';

	/** textarea element */
	get textarea(): HTMLTextAreaElement {
		return this.#textarea;
	}

	/** EditorView instance */
	get view(): EditorView | undefined {
		return this.#view;
	}

	/** language */
	get lang(): string {
		return this.#lang;
	}

	/** whether the editor view is visible */
	get visible(): boolean {
		return this.#visible && this.textarea.isConnected;
	}

	/**
	 * @param textarea textarea element
	 * @param lang language
	 * @param config language configuration
	 * @param init whether to initialize the editor immediately
	 */
	constructor(textarea: HTMLTextAreaElement, lang = 'plain', config?: unknown, init = true) {
		this.#textarea = textarea;
		this.#lang = lang;
		if (init) {
			this.initialize(config);
		}
	}

	/**
	 * Initialize the editor
	 * @param config language configuration
	 */
	initialize(config?: unknown): void {
		let timer: NodeJS.Timeout | undefined;
		const {textarea, lang} = this,
			{value, dir: d, accessKey, tabIndex, lang: l, readOnly} = textarea,
			extensions = [
				this.#language.of(languages[lang]!(config)),
				this.#linter.of(linters[lang] ?? []),
				this.#extensions.of([]),
				this.#dir.of(EditorView.editorAttributes.of({dir: d})),
				this.#extraKeys.of([]),
				this.#phrases.of(EditorState.phrases.of(phrases)),
				this.#lineWrapping.of(EditorView.lineWrapping),
				syntaxHighlighting(defaultHighlightStyle),
				EditorView.contentAttributes.of({
					accesskey: accessKey,
					tabindex: String(tabIndex),
				}),
				EditorView.editorAttributes.of({lang: l}),
				lineNumbers(),
				highlightActiveLineGutter(),
				keymap.of([
					...defaultKeymap,
					...searchKeymap,
					{
						key: 'Mod-Shift-x',
						run: (): true => {
							const dir = textarea.dir === 'rtl' ? 'ltr' : 'rtl';
							textarea.dir = dir;
							this.#effects(this.#dir.reconfigure(EditorView.editorAttributes.of({dir})));
							return true;
						},
					},
				]),
				EditorView.theme({
					'.cm-panels': {direction: document.dir},
				}),
				EditorView.updateListener.of(({
					state: {doc},
					startState: {doc: startDoc},
					docChanged,
					focusChanged,
				}) => {
					if (docChanged) {
						clearTimeout(timer);
						timer = setTimeout(() => {
							textarea.value = doc.toString();
							textarea.dispatchEvent(new Event('input'));
						}, 400);
						if (!startDoc.toString().trim()) {
							this.setIndent(this.#indentStr);
						}
					}
					if (focusChanged) {
						textarea.dispatchEvent(new Event(this.#view!.hasFocus ? 'focus' : 'blur'));
					}
				}),
				...readOnly
					? [
						EditorState.readOnly.of(true),
						EditorState.transactionFilter.of(tr => tr.docChanged ? [] : tr),
						EditorView.theme({
							'input[type="color"]': {pointerEvents: 'none'},
						}),
					]
					: [
						history(),
						indentOnInput(),
						this.#indent.of(indentUnit.of(detectIndent(value, this.#indentStr, lang))),
						keymap.of([
							...historyKeymap,
							indentWithTab,
							{win: 'Ctrl-Shift-z', run: redo, preventDefault: true},
						]),
					],
			];
		this.#view = new EditorView({
			extensions,
			doc: value,
		});
		const {fontSize, lineHeight, border} = getComputedStyle(textarea);
		textarea.before(this.#view.dom);
		this.#minHeight();
		this.#view.dom.style.border = border;
		this.#view.scrollDOM.style.fontSize = fontSize;
		this.#view.scrollDOM.style.lineHeight = lineHeight;
		this.toggle(true);
		this.#view.dom.addEventListener('click', foldHandler(this.#view));
		this.prefer({});
	}

	/**
	 * 修改扩展
	 * @param effects 扩展变动
	 */
	#effects(effects: StateEffect<unknown> | StateEffect<unknown>[]): void {
		this.#view!.dispatch({effects});
	}

	/**
	 * 设置编辑器最小高度
	 * @param linting 是否启用语法检查
	 */
	#minHeight(linting?: boolean): void {
		this.#view!.dom.style.minHeight = linting ? 'calc(100px + 2em)' : '2em';
	}

	/** 获取语法检查扩展 */
	#getLintExtension(): LintExtension | undefined {
		return (this.#linter.get(this.#view!.state) as LintExtension[])[0];
	}

	/**
	 * Set language
	 * @param lang language
	 * @param config language configuration
	 */
	// eslint-disable-next-line @typescript-eslint/require-await
	async setLanguage(lang = 'plain', config?: unknown): Promise<void> {
		this.#lang = lang;
		if (this.#view) {
			const ext = (languages[lang] ?? plain)(config);
			this.#effects([
				this.#language.reconfigure(ext),
				this.#linter.reconfigure(linters[lang] ?? []),
			]);
			this.#minHeight(Boolean(linters[lang]));
			this.prefer({});
		}
	}

	/**
	 * Start syntax checking
	 * @param lintSource function for syntax checking
	 */
	lint(lintSource?: LintSource): void {
		const linterExtension = lintSource
			? [
				linter(async ({state}) => {
					const diagnostics = await lintSource(state);
					if (state.readOnly) {
						for (const diagnostic of diagnostics) {
							delete diagnostic.actions;
						}
					}
					return diagnostics;
				}),
				lintGutter(),
				keymap.of(lintKeymap),
				statusBar(lintSource.fixer),
			]
			: [];
		if (lintSource) {
			linters[this.#lang] = linterExtension;
		} else {
			delete linters[this.#lang];
		}
		if (this.#view) {
			this.#effects(this.#linter.reconfigure(linterExtension));
			this.#minHeight(Boolean(lintSource));
		}
	}

	/** Update syntax checking immediately */
	update(): void {
		if (this.#view) {
			const extension = this.#getLintExtension();
			if (extension) {
				const plugin = this.#view.plugin(extension[1])!;
				plugin.set = true;
				plugin.force();
			}
		}
	}

	/**
	 * Add extensions
	 * @param names extension names
	 */
	prefer(names: string[] | Record<string, boolean>): void {
		if (Array.isArray(names)) {
			this.#preferred = new Set(names.filter(name => Object.prototype.hasOwnProperty.call(avail, name)));
		} else {
			for (const [name, enable] of Object.entries(names)) {
				if (enable && Object.prototype.hasOwnProperty.call(avail, name)) {
					this.#preferred.add(name);
				} else {
					this.#preferred.delete(name);
				}
			}
		}
		if (this.#view) {
			const {readOnly} = this.#view.state;
			this.#effects(
				this.#extensions.reconfigure(
					[...this.#preferred].filter(name => !readOnly || !editExtensions.has(name)).map(name => {
						const [extension, configs = {}] = avail[name]!;
						return extension(configs[this.#lang], this);
					}),
				),
			);
		}
	}

	/**
	 * Set text indentation
	 * @param indent indentation string
	 */
	setIndent(indent: string): void {
		if (this.#view) {
			this.#effects(this.#indent.reconfigure(indentUnit.of(
				detectIndent(this.#view.state.doc as ExtendedText, indent, this.#lang),
			)));
		} else {
			this.#indentStr = indent;
		}
	}

	/**
	 * Set line wrapping
	 * @param wrapping whether to enable line wrapping
	 */
	setLineWrapping(wrapping: boolean): void {
		if (this.#view) {
			this.#effects(this.#lineWrapping.reconfigure(wrapping ? EditorView.lineWrapping : []));
		}
	}

	/**
	 * Get default linter
	 * @param opt linter options
	 */
	async getLinter(opt?: Option | LiveOption): Promise<LintSource | undefined> {
		return linterRegistry[this.#lang]?.(opt, this.#view);
	}

	/**
	 * Set content
	 * @param insert new content
	 * @param force whether to forcefully replace the content
	 */
	setContent(insert: string, force?: boolean): void {
		if (this.#view) {
			this.#view.dispatch({
				changes: {from: 0, to: this.#view.state.doc.length, insert},
				filter: !force,
			});
		}
	}

	/**
	 * Switch between textarea and editor view
	 * @param show whether to show the editor view
	 */
	toggle(show = !this.#visible): void {
		if (!this.#view) {
			return;
		} else if (show && !this.#visible) {
			const {value, selectionStart, selectionEnd, scrollTop, offsetHeight, style: {height}} = this.#textarea,
				hasFocus = document.activeElement === this.#textarea;
			this.setContent(value);
			this.#view.dom.style.height = offsetHeight ? `${offsetHeight}px` : height;
			this.#view.dom.style.removeProperty('display');
			this.#textarea.style.display = 'none';
			this.#view.requestMeasure();
			this.#view.dispatch({
				selection: {anchor: selectionStart, head: selectionEnd},
			});
			if (hasFocus) {
				this.#view.focus();
			}
			requestAnimationFrame(() => {
				this.#view!.scrollDOM.scrollTop = scrollTop;
			});
		} else if (!show && this.#visible) {
			const {state: {selection: {main: {from, to, head}}}, hasFocus} = this.#view,
				{scrollDOM: {scrollTop}} = this.#view;
			this.#view.dom.style.setProperty('display', 'none', 'important');
			this.#textarea.style.display = '';
			this.#textarea.setSelectionRange(from, to, head === to ? 'forward' : 'backward');
			if (hasFocus) {
				this.#textarea.focus();
			}
			requestAnimationFrame(() => {
				this.#textarea.scrollTop = scrollTop;
			});
		}
		this.#visible = show;
	}

	/** Destroy the editor */
	destroy(): void {
		if (this.visible) {
			this.toggle(false);
		}
		if (this.#view) {
			for (const listener of destroyListeners) {
				listener(this.#view);
			}
			this.#view.destroy();
		}
		Object.setPrototypeOf(this, null);
	}

	/**
	 * Define extra key bindings
	 * @param keys key bindings
	 */
	extraKeys(keys: KeyBinding[]): void {
		if (this.#view) {
			this.#effects(this.#extraKeys.reconfigure(keymap.of(keys)));
		}
	}

	/**
	 * Set translation messages
	 * @param messages translation messages
	 */
	localize(messages?: Record<string, string>): void {
		Object.assign(phrases, messages);
		if (this.#view) {
			this.#effects(this.#phrases.reconfigure(EditorState.phrases.of(phrases)));
		}
	}

	/**
	 * Get the syntax node at the specified position
	 * @param position position
	 */
	getNodeAt(position: number): SyntaxNode | undefined {
		return this.#view && ensureSyntaxTree(this.#view.state, position)?.resolve(position, 1);
	}

	/**
	 * Scroll to the specified position
	 * @param position position or selection range
	 */
	scrollTo(position?: number | {anchor: number, head: number}): void {
		if (this.#view) {
			const r = position ?? this.#view.state.selection.main,
				effects = EditorView.scrollIntoView(typeof r === 'number' || r instanceof SelectionRange
					? r
					: EditorSelection.range(r.anchor, r.head)) as StateEffect<{isSnapshot: boolean}>;
			effects.value.isSnapshot = true;
			this.#view.dispatch({effects});
		}
	}

	/**
	 * Replace the current selection with the result of a function
	 * @param view EditorView instance
	 * @param func function to produce the replacement text
	 */
	static replaceSelections(
		view: EditorView,
		func: (str: string, range: DocRange) => string | [string, number, number?],
	): void {
		const {state} = view;
		view.dispatch(state.changeByRange(({from, to}) => {
			const result = func(state.sliceDoc(from, to), {from, to});
			if (typeof result === 'string') {
				return {
					range: EditorSelection.range(from, from + result.length),
					changes: {from, to, insert: result},
				};
			}
			const [insert, start, end = start] = result;
			return {
				range: EditorSelection.range(start, end),
				changes: {from, to, insert},
			};
		}));
	}

	/**
	 * Convert a [WikiParser-Node](https://npmjs.com/package/wikiparser-node) configuration
	 * to a CodeMirror-MediaWiki configuration
	 * @param config WikiParser-Node configuration
	 */
	static getMwConfig(config: ConfigData): MwConfig {
		return getStaticMwConfig(config, tagModes);
	}
}
