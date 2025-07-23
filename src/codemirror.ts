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
	showTooltip,
	gutter,
} from '@codemirror/view';
import {Compartment, EditorState, EditorSelection, SelectionRange, StateField, RangeSet} from '@codemirror/state';
import {
	syntaxHighlighting,
	defaultHighlightStyle,
	indentOnInput,
	indentUnit,
	ensureSyntaxTree,
	codeFolding as codeFoldingBase,
	unfoldAll,
	unfoldEffect,
	foldEffect,
	foldedRanges,
	syntaxTree,
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
import escapeKeymap from './escape';
import codeFolding, {
	foldHandler,
	create,
	getAnchor,
	execute,
	traverse,
	markers,
	foldCommand,
	foldRef,
	foldableLine,
	updateSelection,
	FoldMarker,
	findFold,
} from './fold';
import tagMatchingState from './matchTag';
import refHover from './ref';
import magicWordHover, {posToIndex} from './hover';
import signatureHelp from './signature';
import inlayHints from './inlay';
import {getWikiLinter, getJsLinter, getCssLinter, getLuaLinter, getJsonLinter} from './linter';
import openLinks from './openLinks';
import {tagModes, getStaticMwConfig} from './static';
import bidiIsolation from './bidi';
import toolKeymap from './keymap';
import statusBar from './statusBar';
import {detectIndent} from './indent';
import bracketMatching from './matchBrackets';
import wikitextLSP from './lsp';
import javascript from './javascript';
import css from './css';
import lua from './lua';
import vue from './vue';
import type {ViewPlugin, KeyBinding, Tooltip} from '@codemirror/view';
import type {Extension, Text, StateEffect} from '@codemirror/state';
import type {Diagnostic, Action} from '@codemirror/lint';
import type {Config, LanguageSupport} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import type {StyleSpec} from 'style-mod';
import type {ConfigData, QuickFixData} from 'wikiparser-node';
import type {MwConfig} from './token';
import type {DocRange} from './fold';
import type {Option, LiveOption} from './linter';
import type {Text as ExtendedText} from './indent';

export type {MwConfig};
export type LintSource = ((doc: Text) => Diagnostic[] | Promise<Diagnostic[]>) & {
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	fixer?: (doc: Text, rule?: string) => string | Promise<string>;
};
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

const linterRegistry: Record<
	string,
	(opt?: Option | LiveOption, view?: EditorView) => LintSource | Promise<LintSource>
> = {};

const destroyListeners: ((view: EditorView) => void)[] = [];

const editExtensions = new Set(['closeBrackets', 'autocompletion', 'signatureHelp']);

const linters: Record<string, Extension> = {};
const phrases: Record<string, string> = {};

/**
 * 获取指定行列的位置
 * @param doc 文档
 * @param line 行号
 * @param column 列号
 */
const pos = (doc: Text, line: number, column: number): number =>
	posToIndex(doc, {line: line - 1, character: column - 1});

/**
 * 获取Linter选项
 * @param opt Linter选项
 * @param runtime 是否为运行时选项
 */
const getOpt = (opt: Option | LiveOption, runtime?: boolean): Option | Promise<Option> =>
	typeof opt === 'function' ? opt(runtime) : opt;

export const registerMediaWiki = (): void => {
	languages['mediawiki'] = (config: MwConfig): Extension => [
		mediawiki(config),
		plain(),
		bidiIsolation,
		toolKeymap,
	];
	const addon = avail['colorPicker'] as Addon<[Extension?, StyleSpec?]>;
	addon[1] ??= {};
	addon[1]['mediawiki'] = [
		[makeColorPicker({discoverColors}), colorPickerTheme],
		{marginLeft: '0.6ch'},
	];
	(avail['bracketMatching'] as Addon<[Config?, Extension?]>)[1] = {
		mediawiki: [{brackets: '()[]{}（）【】［］｛｝'}, tagMatchingState],
	};
	(avail['codeFolding'] as Addon<Extension>)[1] = {
		mediawiki: [
			codeFoldingBase({
				placeholderDOM(view) {
					const element = document.createElement('span');
					element.textContent = '…';
					element.setAttribute('aria-label', 'folded code');
					element.title = view.state.phrase('unfold');
					element.className = 'cm-foldPlaceholder';
					element.addEventListener('click', ({target}) => {
						const p = view.posAtDOM(target as Node),
							{state} = view,
							{selection} = state;
						foldedRanges(state).between(p, p, (from, to) => {
							if (from === p) {
								// Unfold the template and redraw the selections
								view.dispatch({effects: unfoldEffect.of({from, to}), selection});
							}
						});
					});
					return element;
				},
			}),
			/** @see https://codemirror.net/examples/tooltip/ */
			StateField.define<Tooltip | null>({
				create,
				update(tooltip, {state, docChanged, selection}) {
					if (docChanged) {
						return null;
					}
					return selection ? create(state) : tooltip;
				},
				provide(f) {
					return showTooltip.from(f);
				},
			}),
			keymap.of([
				{
					// Fold the template at the selection/cursor
					key: 'Ctrl-Shift-[',
					mac: 'Cmd-Alt-[',
					run(view): boolean {
						const {state} = view,
							tree = syntaxTree(state),
							effects: StateEffect<DocRange>[] = [];
						let anchor = getAnchor(state);
						for (const {from, to, empty} of state.selection.ranges) {
							let node: SyntaxNode | null | undefined;
							if (empty) {
								// No selection, try both sides of the cursor position
								node = tree.resolve(from, -1);
							}
							if (!node || node.name === 'Document') {
								node = tree.resolve(from, 1);
							}
							anchor = traverse(state, tree, effects, node, to, anchor, updateSelection);
						}
						return execute(view, effects, anchor);
					},
				},
				{
					// Fold all templates in the document
					key: 'Ctrl-Alt-[',
					run: foldCommand(),
				},
				{
					// Fold all `<ref>` tags in the document
					key: 'Mod-Alt-,',
					run: foldRef,
				},
				{
					// Unfold the template at the selection/cursor
					key: 'Ctrl-Shift-]',
					mac: 'Cmd-Alt-]',
					run(view): boolean {
						const {state} = view,
							{selection} = state,
							effects: StateEffect<DocRange>[] = [],
							folded = foldedRanges(state);
						for (const {from, to} of selection.ranges) {
							// Unfold any folded range at the selection
							folded.between(from, to, (i, j) => {
								effects.push(unfoldEffect.of({from: i, to: j}));
							});
						}
						if (effects.length > 0) {
							// Unfold the template(s) and redraw the selections
							view.dispatch({effects, selection});
							return true;
						}
						return false;
					},
				},
				{key: 'Ctrl-Alt-]', run: unfoldAll},
			]),
			markers,
			gutter({
				class: 'cm-foldGutter',
				markers(view) {
					return view.plugin(markers)?.markers ?? RangeSet.empty;
				},
				initialSpacer() {
					return new FoldMarker(false);
				},
				domEventHandlers: {
					click(view, line) {
						const folded = findFold(view, line);
						if (folded) {
							view.dispatch({effects: unfoldEffect.of(folded)});
							return true;
						}
						const range = foldableLine(view, line);
						if (range) {
							view.dispatch({effects: foldEffect.of(range)});
							return true;
						}
						return false;
					},
				},
			}),
		],
	};
	Object.assign(avail, {
		openLinks: mediawikiOnly(openLinks),
		escape: mediawikiOnly(keymap.of(escapeKeymap)),
		refHover: mediawikiOnly(refHover),
		hover: mediawikiOnly(magicWordHover),
		signatureHelp: mediawikiOnly(signatureHelp),
		inlayHints: mediawikiOnly(inlayHints),
	});
	linterRegistry['mediawiki'] = async (opt, v): Promise<LintSource> => {
		const wikiLint = await getWikiLinter(await getOpt(opt), v);
		return async doc => (await wikiLint(doc.toString(), await getOpt(opt, true)))
			.map(({severity, code, message, range: r, from, to, data = [], source}): Diagnostic => ({
				source: source!,
				from: from ?? posToIndex(doc, r!.start),
				to: to ?? posToIndex(doc, r!.end),
				severity: severity === 2 ? 'warning' : 'error',
				message: source === 'Stylelint' ? message : `${message} (${code})`,
				actions: (data as QuickFixData[]).map(({title, range, newText}): Action => ({
					name: title,
					apply(view): void {
						view.dispatch({
							changes: {
								from: posToIndex(doc, range.start),
								to: posToIndex(doc, range.end),
								insert: newText,
							},
						});
					},
				})),
			}));
	};
	destroyListeners.push(view => getLSP(view)?.destroy());
};

export const registerHTML = (): void => {
	Object.assign(FullMediaWiki.prototype, {
		css() {
			return cssParser;
		},
	});
	languages['html'] = html;
};

export const registerJavaScript = (): void => {
	languages['javascript'] = javascript;
	linterRegistry['javascript'] = async (opt): Promise<LintSource> => {
		const esLint = await getJsLinter();
		const lintSource: LintSource = async doc => esLint(doc.toString(), await getOpt(opt))
			.map(({ruleId, message, severity, line, column, endLine, endColumn, fix, suggestions = []}) => {
				const start = pos(doc, line, column),
					diagnostic: Diagnostic = {
						source: 'ESLint',
						message: message + (ruleId ? ` (${ruleId})` : ''),
						severity: severity === 1 ? 'warning' : 'error',
						from: start,
						to: endLine === undefined ? start + 1 : pos(doc, endLine, endColumn!),
					};
				if (fix || suggestions.length > 0) {
					diagnostic.actions = [
						...fix ? [{name: 'fix', fix}] : [],
						...suggestions.map(suggestion => ({name: 'suggestion', fix: suggestion.fix})),
					].map(({name, fix: {range: [from, to], text}}): Action => ({
						name,
						apply(view): void {
							view.dispatch({changes: {from, to, insert: text}});
						},
					}));
				}
				return diagnostic;
			});
		lintSource.fixer = (doc, rule): string => esLint.fixer!(doc.toString(), rule) as string;
		return lintSource;
	};
};

export const registerCSS = (): void => {
	languages['css'] = css;
	const addon = avail['colorPicker'] as Addon<[Extension?]>;
	addon[1] ??= {};
	addon[1]['css'] = [cssColorPicker];
	linterRegistry['css'] = async (opt): Promise<LintSource> => {
		const styleLint = await getCssLinter();
		let option = await getOpt(opt) ?? {};
		if (!('extends' in option || 'rules' in option)) {
			option = {rules: option};
		}
		const lintSource: LintSource = async doc => (await styleLint(doc.toString(), option))
			.map(({text, severity, line, column, endLine, endColumn, fix}): Diagnostic => {
				const diagnostic: Diagnostic = {
					source: 'Stylelint',
					message: text,
					severity,
					from: pos(doc, line, column),
					to: endLine === undefined ? doc.line(line).to : pos(doc, endLine, endColumn!),
				};
				if (fix) {
					diagnostic.actions = [
						{
							name: 'fix',
							apply(view): void {
								view.dispatch({
									changes: {from: fix.range[0], to: fix.range[1], insert: fix.text},
								});
							},
						},
					];
				}
				return diagnostic;
			});
		lintSource.fixer = async (doc, rule): Promise<string> => styleLint.fixer!(doc.toString(), rule);
		return lintSource;
	};
};

export const registerJSON = (): void => {
	languages['json'] = json;
	linterRegistry['json'] = (): LintSource => {
		const jsonLint = getJsonLinter();
		return doc => {
			const [e] = jsonLint(doc.toString());
			if (e) {
				const {message, severity, line, column, position} = e;
				let from = 0;
				if (position) {
					from = Number(position);
				} else if (line && column) {
					from = pos(doc, Number(line), Number(column));
				}
				return [{message, severity, from, to: from}];
			}
			return [];
		};
	};
};

export const registerLua = (): void => {
	languages['lua'] = lua;
	linterRegistry['lua'] = async (): Promise<LintSource> => {
		const luaLint = await getLuaLinter();
		return async doc => (await luaLint(doc.toString()))
			.map(({line, column, end_column: endColumn, msg: message, severity}): Diagnostic => ({
				source: 'Luacheck',
				message,
				severity: severity === 1 ? 'warning' : 'error',
				from: pos(doc, line, column),
				to: pos(doc, line, endColumn + 1),
			}));
	};
};

export const registerVue = (): void => {
	languages['vue'] = vue;
	const addon1 = avail['closeBrackets'] as Addon<Extension>;
	addon1[1] ??= {};
	addon1[1]['vue'] = autoCloseTags;
	const addon2 = avail['colorPicker'] as Addon<[Extension?]>;
	addon2[1] ??= {};
	addon2[1]['vue'] = [cssColorPicker];
};

export const registerLanguage = (
	name: string,
	lang: (config?: unknown) => LanguageSupport,
	lintSource?: (opt?: Option | LiveOption) => LintSource | Promise<LintSource>,
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
	async setLanguage(lang = 'plain', config?: unknown): Promise<void> {
		this.#lang = lang;
		if (this.#view) {
			let ext = (languages[lang] ?? plain)(config);
			ws: { // eslint-disable-line no-unused-labels
				if (lang === 'mediawiki') {
					ext = [ext, await wikitextLSP()];
				}
			}
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
				linter(async ({state: {doc, readOnly}}) => {
					const diagnostics = await lintSource(doc);
					if (readOnly) {
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
