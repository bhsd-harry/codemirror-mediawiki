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
import {getLSP} from '@bhsd/common';
import colorPicker from './color';
import {mediawiki, html} from './mediawiki';
import escapeKeymap from './escape';
import codeFolding, {foldHandler} from './fold';
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
import {detectIndent, noDetectionLangs} from './indent';
import bracketMatching from './matchBrackets';
import javascript from './javascript';
import css from './css';
import lua from './lua';
import type {ViewPlugin, KeyBinding} from '@codemirror/view';
import type {Extension, Text, StateEffect} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {Diagnostic, Action} from '@codemirror/lint';
import type {ConfigData, QuickFixData} from 'wikiparser-node';
import type {MwConfig} from './token';
import type {DocRange} from './fold';
import type {Option, LiveOption} from './linter';

export type {MwConfig};
export type LintSource = ((doc: Text) => Diagnostic[] | Promise<Diagnostic[]>) & {
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	fixer?: (doc: Text, rule?: string) => string | Promise<string>;
};
export type Addon<T> = [(config?: T, cm?: CodeMirror6) => Extension, Record<string, T>];
export type Dialect = 'sanitized-css' | undefined;

declare type LintExtension = [unknown, ViewPlugin<{set: boolean, force(): void}>];

const plain = (): Extension => EditorView.contentAttributes.of({spellcheck: 'true'});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const languages: Record<string, (config?: any) => Extension> = {
	plain,
	mediawiki(config: MwConfig) {
		return [
			mediawiki(config),
			plain(),
			bidiIsolation,
			toolKeymap,
		];
	},
	html,
	javascript,
	css,
	json,
	lua,
};

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
	highlightSpecialChars: [highlightSpecialChars, {}],
	highlightActiveLine: [highlightActiveLine, {}],
	highlightWhitespace: [highlightWhitespace, {}],
	highlightTrailingWhitespace: [highlightTrailingWhitespace, {}],
	highlightSelectionMatches: [highlightSelectionMatches, {}],
	bracketMatching: [bracketMatching, {mediawiki: {brackets: '()[]{}（）【】［］｛｝'}}],
	closeBrackets: [closeBrackets, {}],
	scrollPastEnd: [scrollPastEnd, {}],
	openLinks: [(enable: boolean, cm): Extension => enable ? openLinks(cm!) : [], {mediawiki: true}],
	allowMultipleSelections: [
		(): Extension => [
			EditorState.allowMultipleSelections.of(true),
			drawSelection(),
			rectangularSelection(),
			crosshairCursor(),
		],
		{},
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
		{},
	],
	codeFolding,
	colorPicker,
	escape: mediawikiOnly(keymap.of(escapeKeymap)),
	tagMatching: mediawikiOnly(tagMatchingState),
	refHover: mediawikiOnly(refHover),
	hover: mediawikiOnly(magicWordHover),
	signatureHelp: mediawikiOnly(signatureHelp),
	inlayHints: mediawikiOnly(inlayHints),
};

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

/** CodeMirror 6 编辑器 */
export class CodeMirror6 {
	declare getWikiConfig?: () => Promise<ConfigData>;
	declare langConfig: MwConfig | undefined;
	declare dialect: Dialect;
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

	get textarea(): HTMLTextAreaElement {
		return this.#textarea;
	}

	get view(): EditorView | undefined {
		return this.#view;
	}

	get lang(): string {
		return this.#lang;
	}

	get visible(): boolean {
		return this.#visible && this.textarea.isConnected;
	}

	/**
	 * @param textarea 文本框
	 * @param lang 语言
	 * @param config 语言设置
	 * @param init 是否初始化
	 */
	constructor(textarea: HTMLTextAreaElement, lang = 'plain', config?: unknown, init = true) {
		this.#textarea = textarea;
		this.#lang = lang;
		if (init) {
			this.initialize(config);
		}
	}

	/**
	 * 初始化编辑器
	 * @param config 语言设置
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
						if (!noDetectionLangs.has(this.lang) && !startDoc.toString().trim()) {
							this.setIndent(detectIndent(doc.toString(), this.#indentStr, this.lang));
						}
					}
					if (focusChanged) {
						textarea.dispatchEvent(new Event(this.#view!.hasFocus ? 'focus' : 'blur'));
					}
				}),
				...readOnly
					? [EditorState.readOnly.of(true)]
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
	 * 设置语言
	 * @param lang 语言
	 * @param config 语言设置
	 */
	setLanguage(lang = 'plain', config?: unknown): void | Promise<void> {
		this.#lang = lang;
		if (this.#view) {
			this.#effects([
				this.#language.reconfigure(languages[lang]!(config)),
				this.#linter.reconfigure(linters[lang] ?? []),
			]);
			this.#minHeight(Boolean(linters[lang]));
			this.prefer({});
		}
	}

	/**
	 * 开始语法检查
	 * @param lintSource 语法检查函数
	 */
	lint(lintSource?: LintSource): void {
		const linterExtension = lintSource
			? [
				linter(view => lintSource(view.state.doc)),
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

	/** 立即更新语法检查 */
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
	 * 添加扩展
	 * @param names 扩展名
	 */
	prefer(names: string[] | Record<string, boolean>): void {
		if (Array.isArray(names)) {
			this.#preferred = new Set(names.filter(name => avail[name]));
		} else {
			for (const [name, enable] of Object.entries(names)) {
				if (enable && avail[name]) {
					this.#preferred.add(name);
				} else {
					this.#preferred.delete(name);
				}
			}
		}
		if (this.#view) {
			this.#effects(
				this.#extensions.reconfigure([...this.#preferred].map(name => {
					const [extension, configs] = avail[name]!;
					return extension(configs[this.#lang], this);
				})),
			);
		}
	}

	/**
	 * 设置缩进
	 * @param indent 缩进字符串
	 */
	setIndent(indent: string): void {
		if (this.#view) {
			this.#effects(this.#indent.reconfigure(indentUnit.of(indent)));
		} else {
			this.#indentStr = indent;
		}
	}

	/**
	 * 设置文本换行
	 * @param wrapping 是否换行
	 */
	setLineWrapping(wrapping: boolean): void {
		if (this.#view) {
			this.#effects(this.#lineWrapping.reconfigure(wrapping ? EditorView.lineWrapping : []));
		}
	}

	/**
	 * 获取默认linter
	 * @param opt 选项
	 */
	async getLinter(opt?: Option | LiveOption): Promise<LintSource | undefined> {
		const isFunc = typeof opt === 'function',
			getOpt = (runtime?: boolean): Option => isFunc ? opt(runtime) : opt;
		switch (this.#lang) {
			case 'mediawiki': {
				const wikiLint = await getWikiLinter(getOpt(), this.#view);
				return async doc => (await wikiLint(doc.toString(), getOpt(true)))
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
			}
			case 'javascript': {
				const esLint = await getJsLinter();
				const lintSource: LintSource = doc => esLint(doc.toString(), getOpt())
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
			}
			case 'css': {
				const styleLint = await getCssLinter();
				let option = getOpt() ?? {};
				if (!('extends' in option || 'rules' in option)) {
					option = {rules: option};
				}
				if (this.dialect === 'sanitized-css') {
					const rules = option['rules'] as Record<string, unknown> | undefined;
					option = {
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
			}
			case 'lua': {
				const luaLint = await getLuaLinter();
				return async doc => (await luaLint(doc.toString()))
					.map(({line, column, end_column: endColumn, msg: message, severity}): Diagnostic => ({
						source: 'Luacheck',
						message,
						severity: severity === 1 ? 'warning' : 'error',
						from: pos(doc, line, column),
						to: pos(doc, line, endColumn + 1),
					}));
			}
			case 'json': {
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
			}
			default:
				return undefined;
		}
	}

	/**
	 * 重设编辑器内容
	 * @param insert 新内容
	 */
	setContent(insert: string): void {
		if (this.#view) {
			this.#view.dispatch({
				changes: {from: 0, to: this.#view.state.doc.length, insert},
			});
		}
	}

	/**
	 * 在编辑器和文本框之间切换
	 * @param show 是否显示编辑器
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

	/** 销毁实例 */
	destroy(): void {
		if (this.visible) {
			this.toggle(false);
		}
		if (this.#view) {
			getLSP(this.#view)?.destroy();
			this.#view.destroy();
		}
		Object.setPrototypeOf(this, null);
	}

	/**
	 * 添加额外快捷键
	 * @param keys 快捷键
	 */
	extraKeys(keys: KeyBinding[]): void {
		if (this.#view) {
			this.#effects(this.#extraKeys.reconfigure(keymap.of(keys)));
		}
	}

	/**
	 * 设置翻译信息
	 * @param messages 翻译信息
	 */
	localize(messages?: Record<string, string>): void {
		Object.assign(phrases, messages);
		if (this.#view) {
			this.#effects(this.#phrases.reconfigure(EditorState.phrases.of(phrases)));
		}
	}

	/**
	 * 获取语法树节点
	 * @param position 位置
	 */
	getNodeAt(position: number): SyntaxNode | undefined {
		return this.#view && ensureSyntaxTree(this.#view.state, position)?.resolve(position, 1);
	}

	/**
	 * 滚动至指定位置
	 * @param position 位置
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
	 * 替换选中内容
	 * @param view
	 * @param func 替换函数
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
	 * 将wikiparser-node设置转换为codemirror-mediawiki设置
	 * @param config
	 */
	static getMwConfig(config: ConfigData): MwConfig {
		return getStaticMwConfig(config, tagModes);
	}
}
