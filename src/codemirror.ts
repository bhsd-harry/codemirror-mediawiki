import {EditorView, lineNumbers, keymap, highlightActiveLineGutter} from '@codemirror/view';
import {
	EditorSelection,
	Compartment,
	EditorState,
	SelectionRange,
	Prec,
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
	insertTab,
	indentLess,
	deleteCharBackwardStrict,
} from '@codemirror/commands';
import {search, searchKeymap} from '@codemirror/search';
import {
	linter,
	lintGutter,
} from '@codemirror/lint';
import {tags} from '@lezer/highlight';
import elt from 'crelt';
import {getParserConfig} from '@bhsd/cm-util';
import {
	diagnosticSelector,
	baseData,
	panelSelector,
	panelsSelector,
	noDetectionLangs,
	linkSelector,
	guideColor,
	contentSelector,
	scrollerSelector,
} from './constants.js';
import {
	getHighlightExtension,
	leadingSpaces,
} from './util.js';
import {light} from './theme.js';
import {nextDiagnostic} from './lint.js';
import type {
	ViewPlugin,
	KeyBinding,
	DecorationSet,
} from '@codemirror/view';
import type {
	Extension,
	StateEffect,
	StateField,
	StateCommand,
	Text,
} from '@codemirror/state';
import type {Language, TagStyle} from '@codemirror/language';
import type {Diagnostic} from '@codemirror/lint';
import type {SyntaxNode} from '@lezer/common';
import type {Tag} from '@lezer/highlight';
import type {ConfigGetter} from '@bhsd/browser';
import type {Option, LiveOption} from '@bhsd/cm-util';
import type {
	ConfigData,
} from 'wikiparser-node';
import type {LanguageServiceBase} from 'wikiparser-node/dist/extensions/typings';
import type {foldHandler} from './fold';
import type {DocRange} from './util';
import type {detectIndent} from './indent';
import type {LintSource, LintSources, LintSourceGetter} from './lintsource';
import type statusBar from './statusBar';
import type {MwConfig} from './token';
import type {Selection} from './matchBrackets';

export type AddonMain<T> = (config?: T, cm?: CodeMirror6) => Extension;
export interface AddonConfig {
	dep?: string[];
}
export type Addon<T> = [AddonMain<T>, Map<string, T>?, AddonConfig?];
export type Dialect = 'sanitized-css' | undefined;

export type ReplaceFunction = (str: string, range: DocRange) => string | [string, number, number?];

declare interface MenuItem {
	name: string;
	isActionable(this: void, cm: CodeMirror6): boolean;
	getItems(this: void, cm: CodeMirror6): HTMLElement[];
}

declare type LintExtension = [
	unknown,
	ViewPlugin<{set: boolean, force(): void}>,
	[StateField<{diagnostics: DecorationSet}>],
];

declare interface OptionalFunctions {
	statusBar: typeof statusBar;
	detectIndent: typeof detectIndent;
	foldHandler: typeof foldHandler;
}

declare type KnownTag = keyof typeof tags;
declare interface SimplifiedTagStyle extends Omit<TagStyle, 'tag'> {
	tag: string | string[];
}

const insertNewlineKeepIndent: StateCommand = ({state, dispatch}) => {
	dispatch(state.update(
		state.changeByRange(({from, to}) => {
			const {text, from: f} = state.doc.lineAt(from),
				indent = leadingSpaces(text.slice(0, from - f));
			return {
				changes: {from, to, insert: state.lineBreak + indent},
				range: EditorSelection.cursor(from + indent.length + 1),
			};
		}),
		{scrollIntoView: true, userEvent: 'input'},
	));
	return true;
};

export const plain = (): Extension => [
	EditorView.contentAttributes.of({spellcheck: 'true'}),
	keymap.of([
		{key: 'Enter', run: insertNewlineKeepIndent, shift: insertNewlineKeepIndent},
		{key: 'Backspace', run: deleteCharBackwardStrict, preventDefault: true},
	]),
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const languages = new Map<string, (config?: any, cm?: CodeMirror6) => Extension>([['plain', plain]]);

export const avail = new Map<string, Addon<any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any

export const linterRegistry = new Map<string, LintSourceGetter>();

export const menuRegistry: MenuItem[] = [];

export const destroyListeners: ((view: EditorView) => void)[] = [];

export const themes = new Map([['light', light]]);

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

const editExtensions = new Set(['closeBrackets', 'closeTags', 'autocompletion', 'signatureHelp', 'escape']);

const linters = new Map<string, (cm: CodeMirror6) => Extension>();
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

const getDefaultCustomHighlightStyles = (): {
	light: TagStyle[];
	dark: TagStyle[];
	'': TagStyle[];
} => {
	return {light: [], dark: [], '': []};
};

/** CodeMirror 6 editor */
export class CodeMirror6 {
	static get CDN(): string | undefined {
		return baseData.CDN;
	}

	static set CDN(url: string | undefined) {
		baseData.CDN = url;
	}

	/** only for sanitized-css */
	declare dialect: Dialect;
	declare getWikiConfig?: ConfigGetter;
	declare langConfig: Partial<MwConfig> & Pick<MwConfig, 'titleParser'> | undefined;
	declare lsp: LanguageServiceBase | undefined;
	readonly #textarea;
	readonly #language = new Compartment();
	readonly #linter = new Compartment();
	readonly #extensions = new Compartment();
	readonly #dir = new Compartment();
	readonly #indent = new Compartment();
	readonly #column = new Compartment();
	readonly #extraKeys = new Compartment();
	readonly #phrases = new Compartment();
	readonly #lineWrapping = new Compartment();
	readonly #theme = new Compartment();
	readonly #customHighlight = new Compartment();
	#view: EditorView | undefined;
	#lang;
	#visible = false;
	#preferred = new Set<string>();
	#indentStr = '\t';
	#col = 0;
	#nestedMWLanguage: Language | undefined;
	#lintSources: LintSource[] = [];
	#customHighlightStyles = getDefaultCustomHighlightStyles();

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

	/** @private */
	get indent(): string {
		return this.#indentStr;
	}

	/** @private */
	get columnGuide(): number {
		return this.#col;
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
		const lang: Extension & {nestedMWLanguage?: Language} = (languages.get(this.#lang) ?? plain)(config, this);
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
				this.#linter.of(linters.get(lang)?.(this) ?? []),
				this.#extensions.of([]),
				this.#dir.of(EditorView.editorAttributes.of({dir: d})),
				this.#extraKeys.of([]),
				this.#phrases.of(EditorState.phrases.of(phrases)),
				this.#lineWrapping.of(EditorView.lineWrapping),
				this.#theme.of(light),
				this.#customHighlight.of(this.#getCustomHighlightExtension()),
				this.#indent.of(this.#getIndent(value)),
				this.#column.of(this.#getColumnGuide(this.#col)),
				syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
				EditorView.contentAttributes.of({
					accesskey: accessKey,
					tabindex: String(tabIndex),
				}),
				EditorView.editorAttributes.of({lang: l}),
				lineNumbers(),
				highlightActiveLineGutter(),
				search({
					scrollToMatch(range, view) {
						const scrollRect = view.scrollDOM.getBoundingClientRect(),
							startCoords = view.coordsAtPos(range.from),
							endCoords = view.coordsAtPos(range.to),
							isInViewport = startCoords && startCoords.top >= scrollRect.top
								&& endCoords && endCoords.bottom <= scrollRect.bottom;
						return EditorView.scrollIntoView(range, {y: isInViewport ? 'nearest' : 'center'});
					},
				}),
				EditorView.scrollHandler.of((view, {head}, options) => {
					if (options.x === 'nearest' && options.y === 'center') {
						const {scrollDOM} = view,
							{clientHeight} = scrollDOM,
							{top, height} = view.lineBlockAt(head);
						if (height < clientHeight - options.yMargin * 2) {
							scrollDOM.scrollTop = top + (height - clientHeight) / 2;
						}
						options.y = 'nearest';
					}
					return false;
				}),
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
					[scrollerSelector]: {
						minHeight: '2em',
					},
					[panelsSelector]: {
						direction: document.dir,
					},
					'.cm-lineNumbers .cm-gutterElement': {
						textAlign: 'end',
					},
					[`.cm-textfield, .cm-button,${panelSelector}.cm-search label,${panelSelector}.cm-dialog label`]: {
						fontSize: 'inherit',
					},
					[`${panelSelector} [name="close"]`]: {
						color: 'inherit',
					},
					[`${linkSelector}>span`]: {
						color: 'var(--cm-link)',
						textDecoration: 'underline',
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
					GH: if (
						selectionSet && this.#lang === 'mediawiki'
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
					]
					: [
						history(),
						indentOnInput(),
						keymap.of([
							...historyKeymap,
							{key: 'Tab', run: insertTab, shift: indentLess},
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
	 * Set language
	 * @param lang language
	 * @param config language configuration
	 */
	// eslint-disable-next-line @typescript-eslint/require-await
	async setLanguage(lang = 'plain', config?: unknown): Promise<void> {
		this.#lang = lang;
		if (this.#view) {
			const ext = this.#getLanguage(config),
				hasLinter = linters.has(lang);
			this.#effects([
				this.#language.reconfigure(ext),
				this.#linter.reconfigure(hasLinter ? linters.get(lang)!(this) : []),
			]);
			this.setIndent(this.#indentStr);
			this.setColumnGuide(this.#col);
			this.prefer({});
		}
	}

	/**
	 * Start syntax checking
	 * @param lintSource function for syntax checking
	 */
	lint(lintSource?: LintSources): void {
		const lintSources: LintSources | undefined = typeof lintSource === 'function' ? [lintSource] : lintSource;
		const linterExtension = (cm: CodeMirror6): Extension => lintSources?.length
			? [
				...lintSources.map(source =>
					linter(async v => {
						if (source.disabled) {
							return [];
						}
						const {state} = v,
							diagnostics = (await source(
								state,
							)).map((diagnostic): Diagnostic => ({
								...diagnostic,
								renderMessage(view): HTMLElement {
									const span = elt(
										'span',
										{class: diagnosticSelector.slice(1)},
										diagnostic.renderMessage?.call(this, view) ??
										this.message,
									);
									span.addEventListener('click', () => {
										view.dispatch({
											selection: {anchor: this.from, head: this.to},
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
				keymap.of([{key: 'F8', run: () => nextDiagnostic(this)}]),
				optionalFunctions.statusBar(cm, lintSources[0].fixer),
			]
			: [];
		if (lintSource) {
			this.#lintSources = lintSources!;
			linters.set(this.#lang, linterExtension);
		} else {
			this.#lintSources.length = 0;
			linters.delete(this.#lang);
		}
		if (this.#view) {
			this.#effects(this.#linter.reconfigure(linterExtension(this)));
		}
	}

	/** @private */
	getLintExtension(): LintExtension | undefined {
		return this.#view && (this.#linter.get(this.#view.state) as [LintExtension?])[0];
	}

	/** Update syntax checking immediately */
	update(): void {
		const extension = this.getLintExtension();
		if (extension) {
			const plugin = this.#view!.plugin(extension[1])!;
			plugin.set = true;
			plugin.force();
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
			this.#preferred = new Set(names.filter(name => avail.has(name)));
		} else {
			for (const name in names) {
				if (names[name] && avail.has(name)) {
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
					[
						...new Set(
							[...this.#preferred].filter(name => !readOnly || !editExtensions.has(name))
								.flatMap(name => [name, ...avail.get(name)?.[2]?.dep ?? []]),
						),
					].map(name => {
						const [extension, configs] = avail.get(name)!;
						return extension(configs?.get(this.#lang), this);
					}),
				),
			);
		}
	}

	/**
	 * 计算文档缩进
	 * @param doc 文档内容
	 */
	#getIndent(doc: Text | string): Extension {
		return indentUnit.of(optionalFunctions.detectIndent(doc, this.#indentStr, this.#lang));
	}

	/**
	 * Set text indentation
	 * @param indent indentation string or number of spaces
	 */
	setIndent(indent: string | number): void {
		const level = Number(indent);
		this.#indentStr = level ? ' '.repeat(level) : (indent || '\t') as string;
		if (this.#view) {
			this.#effects(this.#indent.reconfigure(this.#getIndent(this.#view.state.doc)));
		}
	}

	/**
	 * Set a vertical column guide for non-MediaWiki modes
	 * @param col column number (0 to disable)
	 * @since 3.15.0
	 */
	setColumnGuide(col: number): void {
		this.#col = col;
		if (this.#view) {
			this.#effects(this.#column.reconfigure(this.#getColumnGuide(col)));
		}
	}

	/**
	 * 生成行宽辅助线
	 * @param col 列数（0表示禁用）
	 */
	#getColumnGuide(col: number): Extension {
		if (!col || col < 0 || noDetectionLangs.has(this.#lang)) {
			return [];
		}
		const color = `var(${guideColor})`,
			padding = this.#view!.coordsAtPos(0)!.left
				- this.#view!.contentDOM.querySelector('.cm-line')!.getBoundingClientRect().x;
		return EditorView.theme({
			[contentSelector]: {
				backgroundImage: `linear-gradient(${color} 0 100%)`,
				backgroundPosition: `calc(${col}ch + ${padding}px) 0`,
				backgroundRepeat: 'no-repeat',
				backgroundSize: '2px 100%',
			},
		});
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
		return linterRegistry.get(this.#lang)?.(opt, this.#view, this.#nestedMWLanguage);
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
				this.#textarea.focus({preventScroll: true});
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
		if (themes.has(theme)) {
			this.#view?.dispatch({effects: this.#theme.reconfigure(themes.get(theme)!)});
		}
	}

	/**
	 * Customize syntax highlighting
	 * @param specs tag styles
	 * @param themeType whether this highlight style should only be active in dark or light themes
	 * @throws `RangeError` invalid theme type
	 * @since 3.13.1
	 */
	customHighlight(specs: SimplifiedTagStyle | SimplifiedTagStyle[], themeType?: 'light' | 'dark'): void {
		if (!['light', 'dark', '', undefined, null].includes(themeType)) {
			throw new RangeError('Theme type must be either "light" or "dark"!');
		}
		this.#customHighlightStyles[themeType ?? ''].push(
			...(Array.isArray(specs) ? specs : [specs]).map((style): TagStyle => ({
				...style,
				tag: (Array.isArray(style.tag) ? style.tag : [style.tag]).map((tag): Tag | false => {
					const [base, ...modifiers] = tag.split('.');
					if (typeof tags[base as KnownTag] !== 'object') {
						console.warn(`Unknown tag: ${base}`);
						return false;
					}
					let t = tags[base as KnownTag] as Tag;
					for (const modifier of modifiers) {
						if (typeof tags[modifier as KnownTag] === 'function') {
							t = (tags[modifier as KnownTag] as (t: Tag) => Tag)(t);
						} else {
							console.warn(`Unknown tag modifier: ${modifier}`);
						}
					}
					return t;
				}).filter((t): t is Tag => t as boolean),
			})),
		);
		this.#dispatchCustomHighlight();
	}

	/** Remove all custom syntax highlighting styles */
	clearCustomHighlight(): void {
		this.#customHighlightStyles = getDefaultCustomHighlightStyles();
		this.#dispatchCustomHighlight();
	}

	/** 生成自定义高亮扩展 */
	#getCustomHighlightExtension(): Extension {
		const {light: l, dark: d, '': c} = this.#customHighlightStyles;
		return Prec.high([
			l.length === 0 ? [] : getHighlightExtension(l, {themeType: 'light'}),
			d.length === 0 ? [] : getHighlightExtension(d, {themeType: 'dark'}),
			c.length === 0 ? [] : getHighlightExtension(c),
		]);
	}

	/** 更新自定义高亮 */
	#dispatchCustomHighlight(): void {
		this.#view?.dispatch({
			effects: this.#customHighlight.reconfigure(this.#getCustomHighlightExtension()),
		});
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
	 * Internal use only
	 * @ignore
	 */
	static getParserConfig = getParserConfig;

	/**
	 * Convert a [WikiParser-Node](https://npmjs.com/package/wikiparser-node) configuration
	 * to a CodeMirror-MediaWiki configuration
	 * @param config WikiParser-Node configuration
	 */
	// @ts-expect-error abstract static method
	abstract static getMwConfig(config: ConfigData): MwConfig;
}
