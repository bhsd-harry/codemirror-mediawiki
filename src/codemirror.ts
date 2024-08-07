import {
	EditorView,
	lineNumbers,
	keymap,
	highlightSpecialChars,
	highlightActiveLine,
	highlightWhitespace,
	highlightTrailingWhitespace,
	drawSelection,
	scrollPastEnd,
} from '@codemirror/view';
import {Compartment, EditorState, EditorSelection, SelectionRange} from '@codemirror/state';
import {
	syntaxHighlighting,
	defaultHighlightStyle,
	indentOnInput,
	StreamLanguage,
	LanguageSupport,
	bracketMatching,
	indentUnit,
	ensureSyntaxTree,
} from '@codemirror/language';
import {defaultKeymap, historyKeymap, history} from '@codemirror/commands';
import {searchKeymap, highlightSelectionMatches} from '@codemirror/search';
import {linter, lintGutter, lintKeymap} from '@codemirror/lint';
import {
	closeBrackets,
	autocompletion,
	acceptCompletion,
	completionKeymap,
	startCompletion,
} from '@codemirror/autocomplete';
import {mediawiki, html} from './mediawiki';
import {escapeKeymap} from './escape';
import {foldExtension, foldHandler, foldOnIndent, defaultFoldExtension} from './fold';
import {tagMatchingState} from './matchTag';
import {refHover} from './ref';
import {CDN} from './util';
import {getWikiLinter, getJsLinter, getCssLinter, getLuaLinter, getJsonLinter} from './linter';
import {tagModes, getStaticMwConfig} from './static';
import bidiIsolation from './bidi';
import * as plugins from './plugins';
import type {ViewPlugin, KeyBinding} from '@codemirror/view';
import type {Extension, Text, StateEffect} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {Diagnostic, Action} from '@codemirror/lint';
import type {Highlighter} from '@lezer/highlight';
import type {MwConfig} from './token';
import type {DocRange} from './fold';

export {CDN};
export type {MwConfig};
export type LintSource = (doc: Text) => Diagnostic[] | Promise<Diagnostic[]>;

declare type LintExtension = [unknown, ViewPlugin<{set: boolean, force(): void}>];
declare type Addon<T> = [(config?: T) => Extension, Record<string, T>];

const plain = (): Extension => EditorView.contentAttributes.of({spellcheck: 'true'});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const languages: Record<string, (config?: any) => Extension> = {
	plain,
	mediawiki: (config: MwConfig) => [
		mediawiki(config),
		plain(),
		bidiIsolation,
	],
	html,
};
for (const [language, parser] of Object.entries(plugins)) {
	if (typeof parser === 'function') {
		languages[language.slice(0, -2)] = parser;
	} else if (!(language in languages)) {
		languages[language] = (): LanguageSupport => new LanguageSupport(StreamLanguage.define(parser));
	}
}

/**
 * 仅供mediawiki模式的扩展
 * @param ext 扩展
 */
const mediawikiOnly = (ext: Extension = []): Addon<Extension> => [(e = []): Extension => e, {mediawiki: ext}];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const avail: Record<string, Addon<any>> = {
	highlightSpecialChars: [highlightSpecialChars, {}],
	highlightActiveLine: [highlightActiveLine, {}],
	highlightWhitespace: [highlightWhitespace, {}],
	highlightTrailingWhitespace: [highlightTrailingWhitespace, {}],
	highlightSelectionMatches: [highlightSelectionMatches, {}],
	bracketMatching: [bracketMatching, {mediawiki: {brackets: '[]{}'}}],
	closeBrackets: [closeBrackets, {}],
	scrollPastEnd: [scrollPastEnd, {}],
	allowMultipleSelections: [
		(): Extension => [
			EditorState.allowMultipleSelections.of(true),
			drawSelection(),
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
	codeFolding: [
		(e = defaultFoldExtension): Extension => e,
		{
			mediawiki: foldExtension,
			lua: [defaultFoldExtension, foldOnIndent],
		},
	],
	escape: mediawikiOnly(keymap.of(escapeKeymap)),
	tagMatching: mediawikiOnly(tagMatchingState),
	refHover: mediawikiOnly(refHover),
};

const linters: Record<string, Extension> = {};
const phrases: Record<string, string> = {};

/**
 * 获取指定行列的位置
 * @param doc 文档
 * @param line 行号
 * @param column 列号
 */
const pos = (doc: Text, line: number, column: number): number => doc.line(line).from + column - 1;

/** CodeMirror 6 编辑器 */
export class CodeMirror6 {
	readonly #textarea;
	readonly #language = new Compartment();
	readonly #linter = new Compartment();
	readonly #extensions = new Compartment();
	readonly #dir = new Compartment();
	readonly #indent = new Compartment();
	readonly #extraKeys = new Compartment();
	readonly #phrases = new Compartment();
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
		return this.#visible;
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
		let timer: number | undefined;
		const {textarea, lang} = this,
			extensions = [
				this.#language.of(languages[lang]!(config)),
				this.#linter.of(linters[lang] ?? []),
				this.#extensions.of([]),
				this.#dir.of(EditorView.editorAttributes.of({dir: textarea.dir})),
				this.#indent.of(indentUnit.of(this.#indentStr)),
				this.#extraKeys.of([]),
				this.#phrases.of(EditorState.phrases.of(phrases)),
				syntaxHighlighting(defaultHighlightStyle as Highlighter),
				EditorView.contentAttributes.of({
					accesskey: textarea.accessKey,
					tabindex: String(textarea.tabIndex),
				}),
				EditorView.editorAttributes.of({lang: textarea.lang}),
				lineNumbers(),
				EditorView.lineWrapping,
				keymap.of([
					...defaultKeymap,
					...searchKeymap,
					...lintKeymap,
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
				EditorView.updateListener.of(({state: {doc}, docChanged, focusChanged}) => {
					if (docChanged) {
						clearTimeout(timer);
						timer = window.setTimeout(() => {
							textarea.value = doc.toString();
							textarea.dispatchEvent(new Event('input'));
						}, 400);
					}
					if (focusChanged) {
						textarea.dispatchEvent(new Event(this.#view!.hasFocus ? 'focus' : 'blur'));
					}
				}),
				...textarea.readOnly
					? [EditorState.readOnly.of(true)]
					: [
						history(),
						indentOnInput(),
						keymap.of(historyKeymap),
					],
			];
		this.#view = new EditorView({
			extensions,
			doc: textarea.value,
		});
		const {fontSize, lineHeight} = getComputedStyle(textarea);
		textarea.before(this.#view.dom);
		this.#minHeight();
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

	/**
	 * 开关语法检查面板
	 * @param show 是否显示
	 */
	#toggleLintPanel(show: boolean): void {
		if (HTMLUListElement.prototype.focus.name !== 'lintPanelFocus') {
			const lintPanelFocus = function(this: HTMLUListElement, opt?: FocusOptions): void {
				HTMLElement.prototype.focus.call(this, {
					...opt,
					...this.matches('.cm-panel-lint ul') && {preventScroll: true},
				});
			};
			HTMLUListElement.prototype.focus = lintPanelFocus;
		}
		this.#minHeight(show);
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
	setLanguage(lang = 'plain', config?: unknown): void {
		this.#lang = lang;
		if (this.#view) {
			this.#effects([
				this.#language.reconfigure(languages[lang]!(config)),
				this.#linter.reconfigure(linters[lang] ?? []),
			]);
			this.#toggleLintPanel(Boolean(linters[lang]));
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
				linter(view => lintSource(view.state.doc), {autoPanel: true}),
				lintGutter(),
			]
			: [];
		if (lintSource) {
			linters[this.#lang] = linterExtension;
		} else {
			delete linters[this.#lang];
		}
		if (this.#view) {
			this.#effects(this.#linter.reconfigure(linterExtension));
			this.#toggleLintPanel(Boolean(lintSource));
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
					return extension(configs[this.#lang]);
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
	 * 获取默认linter
	 * @param opt 选项
	 */
	async getLinter(opt?: Record<string, unknown>): Promise<LintSource | undefined> {
		switch (this.#lang) {
			case 'mediawiki': {
				const wikiLinter = await getWikiLinter(opt);
				return doc => wikiLinter.codemirror(doc.toString());
			}
			case 'javascript': {
				const esLint = await getJsLinter(opt);
				return doc => esLint(doc.toString())
					.map(({ruleId, message, severity, line, column, endLine, endColumn, fix, suggestions = []}) => {
						const start = pos(doc, line, column),
							diagnostic: Diagnostic = {
								source: 'ESLint',
								message: `${message}${ruleId ? ` (${ruleId})` : ''}`,
								severity: severity === 1 ? 'warning' : 'error',
								from: start,
								to: endLine === undefined ? start + 1 : pos(doc, endLine, endColumn!),
							};
						if (fix || suggestions.length > 0) {
							diagnostic.actions = [
								...fix ? [{name: 'fix', fix}] : [],
								...suggestions.map(suggestion => ({name: 'suggestion', fix: suggestion.fix})),
							].map(({name, fix: {range: [from, to], text}}) => ({
								name,
								apply(view): void {
									view.dispatch({changes: {from, to, insert: text}});
								},
							} as Action));
						}
						return diagnostic;
					});
			}
			case 'css': {
				const styleLint = await getCssLinter(opt);
				return async doc => (await styleLint(doc.toString()))
					.map(({text, severity, line, column, endLine, endColumn}) => ({
						source: 'Stylelint',
						message: text,
						severity,
						from: pos(doc, line, column),
						to: endLine === undefined ? doc.line(line).to : pos(doc, endLine, endColumn!),
					}));
			}
			case 'lua': {
				const luaLint = await getLuaLinter();
				return doc => luaLint(doc.toString());
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

	/** 支持的MediaWiki扩展标签 */
	static mwTagModes = tagModes;

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
	static getMwConfig = getStaticMwConfig;
}
