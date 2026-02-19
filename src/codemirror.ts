import {EditorView, lineNumbers, keymap, highlightActiveLineGutter} from '@codemirror/view';
import {
	EditorSelection,
	Compartment,
	EditorState,
	SelectionRange,
} from '@codemirror/state';
import {
	syntaxHighlighting,
	defaultHighlightStyle,
	indentOnInput,
	indentUnit,
	ensureSyntaxTree,
	syntaxTree,
} from '@codemirror/language';
import {
	defaultKeymap,
	historyKeymap,
	history,
	redo,
	indentWithTab,
	insertNewlineKeepIndent,
	deleteCharBackwardStrict,
} from '@codemirror/commands';
import {searchKeymap} from '@codemirror/search';
import {linter, lintGutter, nextDiagnostic} from '@codemirror/lint';
import elt from 'crelt';
import {base, panelSelector, panelsSelector, diagnosticSelector, noDetectionLangs} from './constants.js';
import {light} from './theme.js';
import type {
	ViewPlugin,
	KeyBinding,
} from '@codemirror/view';
import type {Extension, StateEffect} from '@codemirror/state';
import type {Language} from '@codemirror/language';
import type {Diagnostic} from '@codemirror/lint';
import type {SyntaxNode} from '@lezer/common';
import type {ConfigGetter} from '@bhsd/browser';
import type {ConfigData} from 'wikiparser-node';
import type {
	DocRange,
	foldHandler,
} from './fold';
import type {Text as ExtendedText, detectIndent} from './indent';
import type {Option, LiveOption} from './linter';
import type {LintSource, LintSources, LintSourceGetter} from './lintsource';
import type statusBar from './statusBar';
import type {MwConfig} from './token';
import type {Selection} from './matchBrackets';

export type AddonMain<T> = (config?: T, cm?: CodeMirror6) => Extension;
export type Addon<T> = [AddonMain<T>, Record<string, T>?];
export type Dialect = 'sanitized-css' | undefined;

export type ReplaceFunction = (str: string, range: DocRange) => string | [string, number, number?];

declare interface MenuItem {
	name: string;
	isActionable(this: void, cm: CodeMirror6): boolean;
	getItems(this: void, cm: CodeMirror6): HTMLElement[];
}

declare type LintExtension = [unknown, ViewPlugin<{set: boolean, force(): void}>];

declare interface OptionalFunctions {
	statusBar: typeof statusBar;
	detectIndent: typeof detectIndent;
	foldHandler: typeof foldHandler;
}

export const plain = (): Extension => [
	EditorView.contentAttributes.of({spellcheck: 'true'}),
	keymap.of([
		{key: 'Enter', run: insertNewlineKeepIndent, shift: insertNewlineKeepIndent},
		{key: 'Backspace', run: deleteCharBackwardStrict, preventDefault: true},
	]),
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const languages: Record<string, (config?: any, cm?: CodeMirror6) => Extension> = {plain};

export const avail: Record<string, Addon<any>> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

export const linterRegistry: Record<string, LintSourceGetter> = {};

export const menuRegistry: MenuItem[] = [];

export const destroyListeners: ((view: EditorView) => void)[] = [];

export const themes: Record<string, Extension> = {light};

export const optionalFunctions: OptionalFunctions = {
	statusBar() {
		return [];
	},
	detectIndent(_, indent) {
		return indent;
	},
	foldHandler() {
		return () => {};
	},
};

const editExtensions = new Set(['closeBrackets', 'autocompletion', 'signatureHelp', 'escape']);

const linters: Record<string, (cm: CodeMirror6) => Extension> = {};
const phrases: Record<string, string> = {};

/**
 * 替换选中内容
 * @param view
 * @param func 用于生成替换文本和光标位置的函数
 * @test
 */
export const replaceSelections = (view: EditorView, func: ReplaceFunction): void => {
	const {state} = view;
	view.dispatch(state.changeByRange(range => {
		const {from, to} = range,
			result = func(state.sliceDoc(from, to), range);
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
};

/** CodeMirror 6 editor */
export class CodeMirror6 {
	static get CDN(): string | undefined {
		return base.CDN;
	}

	static set CDN(url: string | undefined) {
		base.CDN = url;
	}

	/** only for sanitized-css */
	declare dialect: Dialect;
	declare getWikiConfig?: ConfigGetter;
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
	readonly #theme = new Compartment();
	#view: EditorView | undefined;
	#lang;
	#visible = false;
	#preferred = new Set<string>();
	#indentStr = '\t';
	#nestedMWLanguage: Language | undefined;
	#lintSources: LintSource[] = [];

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

	/** @private */
	get lintSources(): LintSource[] {
		return this.#lintSources;
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
	 * 获取语言扩展
	 * @param config 语言设置
	 */
	#getLanguage(config: unknown): Extension {
		const isMW = this.#lang === 'mediawiki';
		if (isMW || this.#lang === 'html') {
			config ??= this.langConfig;
		}
		const lang: Extension & {nestedMWLanguage?: Language} = (languages[this.#lang] ?? plain)(config, this);
		this.#nestedMWLanguage = lang.nestedMWLanguage;
		if (isMW) {
			this.langConfig = config as MwConfig;
		}
		return lang;
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
				this.#language.of(this.#getLanguage(config)),
				this.#linter.of(linters[lang]?.(this) ?? []),
				this.#extensions.of([]),
				this.#dir.of(EditorView.editorAttributes.of({dir: d})),
				this.#extraKeys.of([]),
				this.#phrases.of(EditorState.phrases.of(phrases)),
				this.#lineWrapping.of(EditorView.lineWrapping),
				this.#theme.of(light),
				syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
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
					[panelsSelector]: {
						direction: document.dir,
					},
					'& .cm-lineNumbers .cm-gutterElement': {
						textAlign: 'end',
					},
					[`.cm-textfield, .cm-button,${panelSelector}.cm-search label,${panelSelector}.cm-gotoLine label`]: {
						fontSize: 'inherit',
					},
					[`${panelSelector} [name="close"]`]: {
						color: 'inherit',
					},
				}),
				EditorView.updateListener.of(({
					state,
					startState: {doc: startDoc},
					docChanged,
					focusChanged,
					selectionSet,
				}) => {
					if (docChanged) {
						clearTimeout(timer);
						timer = setTimeout(() => {
							textarea.value = state.doc.toString();
							textarea.dispatchEvent(new InputEvent('input'));
						}, 400);
						if (!noDetectionLangs.has(this.#lang) && !startDoc.toString().trim()) {
							this.setIndent(this.#indentStr);
						}
					}
					if (focusChanged) {
						textarea.dispatchEvent(new FocusEvent(this.#view!.hasFocus ? 'focus' : 'blur'));
					}
					if (
						selectionSet && this.lang === 'mediawiki'
						&& ['localhost:8080', 'bhsd-harry.github.io'].includes(location.host)
					) {
						const tree = syntaxTree(state),
							{head} = state.selection.main,
							{name} = tree.resolve(head),
							innerName = tree.resolveInner(head).name;
						if (name !== innerName) {
							console.error(`Cursor at ${head}: ${name} (inner: ${innerName})`);
						}
					}
				}),
				...readOnly
					? [
						EditorState.readOnly.of(true),
						EditorState.changeFilter.of(({docChanged}) => !docChanged),
						EditorView.theme({
							'input[type="color"]': {
								pointerEvents: 'none',
							},
						}),
					]
					: [
						history(),
						indentOnInput(),
						this.#indent.of(indentUnit.of(optionalFunctions.detectIndent(value, this.#indentStr, lang))),
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
		this.#view.dom.addEventListener('click', optionalFunctions.foldHandler(this.#view));
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

	/**
	 * Set language
	 * @param lang language
	 * @param config language configuration
	 */
	// eslint-disable-next-line @typescript-eslint/require-await
	async setLanguage(lang = 'plain', config?: unknown): Promise<void> {
		this.#lang = lang;
		if (this.#view) {
			const ext = this.#getLanguage(config);
			this.#effects([
				this.#language.reconfigure(ext),
				this.#linter.reconfigure(linters[lang]?.(this) ?? []),
			]);
			this.#minHeight(lang in linters);
			this.prefer({});
		}
	}

	/**
	 * Start syntax checking
	 * @param lintSource function for syntax checking
	 */
	lint(lintSource?: LintSources): void {
		const lintSources: LintSources | undefined = typeof lintSource === 'function' ? [lintSource] : lintSource;
		const linterExtension = (cm: CodeMirror6): Extension => lintSources
			? [
				...lintSources.map(source => linter(async ({state}) => {
					const diagnostics = (await source(state)).map((diagnostic): Diagnostic => ({
						...diagnostic,
						renderMessage(view): HTMLElement {
							const span = elt(
								'span',
								{class: diagnosticSelector.slice(1)},
								diagnostic.renderMessage?.(view) ?? diagnostic.message,
							);
							span.addEventListener('click', () => {
								view.dispatch({
									selection: {anchor: diagnostic.from, head: diagnostic.to},
								});
								view.focus();
							});
							return span;
						},
					}));
					if (state.readOnly) {
						for (const diagnostic of diagnostics) {
							delete diagnostic.actions;
						}
					}
					return diagnostics;
				})),
				lintGutter(),
				keymap.of([{key: 'F8', run: nextDiagnostic}]),
				optionalFunctions.statusBar(cm, lintSources[0].fixer),
			]
			: [];
		if (lintSource) {
			this.#lintSources = lintSources!;
			linters[this.#lang] = linterExtension;
		} else {
			this.#lintSources.length = 0;
			delete linters[this.#lang];
		}
		if (this.#view) {
			this.#effects(this.#linter.reconfigure(linterExtension(this)));
			this.#minHeight(Boolean(lintSource));
		}
	}

	/** Update syntax checking immediately */
	update(): void {
		if (this.#view) {
			const [extension] = this.#linter.get(this.#view.state) as LintExtension[];
			if (extension) {
				const plugin = this.#view.plugin(extension[1])!;
				plugin.set = true;
				plugin.force();
			}
		}
	}

	/**
	 * Check if the editor enables a specific extension
	 * @param name extension name
	 * @since 3.2.0
	 */
	hasPreference(name: string): boolean {
		return this.#preferred.has(name);
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
				optionalFunctions.detectIndent(this.#view.state.doc as ExtendedText, indent, this.#lang),
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
		return linterRegistry[this.#lang]?.(opt, this.#view, this.#nestedMWLanguage);
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
				{scrollTop} = this.#view.scrollDOM;
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
		return this.#view && ensureSyntaxTree(this.#view.state, position)?.resolveInner(position, 1);
	}

	/**
	 * Scroll to the specified position
	 * @param position position or selection range
	 */
	scrollTo(position?: number | Selection): void {
		if (this.#view) {
			const r = position ?? this.#view.state.selection.main,
				effects = EditorView.scrollIntoView(
					typeof r === 'number' || r instanceof SelectionRange
						? r
						: EditorSelection.range(r.anchor, r.head),
				) as StateEffect<{isSnapshot: boolean}>;
			effects.value.isSnapshot = true;
			this.#view.dispatch({effects});
		}
	}

	/**
	 * Set the editor theme
	 * @param theme theme name
	 * @since 3.3.0
	 */
	setTheme(theme: string): void {
		if (theme in themes) {
			this.#view?.dispatch({effects: this.#theme.reconfigure(themes[theme]!)});
		}
	}

	/**
	 * Replace the current selection with the result of a function
	 * @param func function to produce the replacement text
	 * @since 3.9.0
	 */
	replaceSelections(func: ReplaceFunction): void {
		if (this.#view) {
			replaceSelections(this.#view, func);
		}
	}

	/**
	 * Replace the current selection with the result of a function
	 * @param view EditorView instance
	 * @param func function to produce the replacement text
	 * @test
	 */
	static replaceSelections = replaceSelections;

	/**
	 * Convert a [WikiParser-Node](https://npmjs.com/package/wikiparser-node) configuration
	 * to a CodeMirror-MediaWiki configuration
	 * @param config WikiParser-Node configuration
	 */
	// @ts-expect-error abstract static method
	abstract static getMwConfig(config: ConfigData): MwConfig;
}
