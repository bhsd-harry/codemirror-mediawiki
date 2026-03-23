import {
	javascript as js,
	javascriptLanguage,
	scopeCompletionSource,
	localCompletionSource,
} from '@codemirror/lang-javascript';
import {ViewPlugin, Decoration} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {setDiagnosticsEffect} from '@codemirror/lint';
import {builtin} from './javascript-globals.js';
import {doctagMark} from './constants.js';
import {markDocTagType} from './util.js';
import type {Extension, Range, EditorState} from '@codemirror/state';
import type {PluginValue, EditorView, ViewUpdate, DecorationSet} from '@codemirror/view';
import type {CompletionContext} from '@codemirror/autocomplete';
import type {Tree} from '@lezer/common';
import type {Linter} from 'eslint';
import type {DocRange} from './fold';
import type {CodeMirror6} from './codemirror';
import type {LintSource} from './lintsource';

export const jsCompletion = javascriptLanguage.data.of({autocomplete: scopeCompletionSource(globalThis)});

const globalsMark = Decoration.mark({class: 'cm-globals'}),
	builtinGlobals = new Set(Object.keys(builtin));

/**
 * 忽略JavaScript正则表达式中的括号匹配
 * @param state
 * @param pos 位置
 * @test
 */
export const exclude = (state: EditorState, pos: number): boolean => javascriptLanguage.isActiveAt(state, pos, 0)
	&& syntaxTree(state).resolveInner(pos, 0).name === 'RegExp';

/**
 * 高亮显示全局变量和JSDoc标签
 * @ignore
 * @test
 */
export const markGlobalsAndDocTag = (
	tree: Tree,
	visibleRanges: readonly DocRange[],
	state: EditorState,
	cm?: CodeMirror6,
): DecorationSet => {
	const decorations: Range<Decoration>[] = [];
	let allGlobals = builtinGlobals;
	if (cm?.lintSources.length && typeof eslint === 'object' && 'environments' in eslint) {
		const {env, globals} = (cm.lintSources[0] as LintSource<Linter.BaseConfig> | undefined)?.config ?? {};
		if (env || globals) {
			allGlobals = new Set(builtinGlobals);
			if (env) {
				for (const key of Object.keys(env)) {
					const obj = (eslint.environments as Map<string, {globals: Record<string, false>}>).get(key)
						?.globals;
					if (obj) {
						for (const k of Object.keys(obj)) {
							allGlobals.add(k);
						}
					}
				}
			}
			if (globals) {
				for (const k of Object.keys(globals)) {
					allGlobals.add(k);
				}
			}
		}
	}
	for (const {from, to} of visibleRanges) {
		tree.iterate({
			from,
			to,
			enter({type, from: f, to: t}) {
				const name = state.sliceDoc(f, t);
				if (!javascriptLanguage.isActiveAt(state, f)) {
					//
				} else if (type.is('VariableName') && allGlobals.has(name)) {
					const completions = localCompletionSource({state, pos: t, explicit: true} as CompletionContext);
					if (!completions?.options.some(({label}) => label === name)) {
						decorations.push(globalsMark.range(f, t));
					}
				} else if (type.is('BlockComment') && /^\/\*{2}(?!\*)/u.test(name)) {
					const comment = name.slice(2),
						mtAll = comment.matchAll(/^[ \t]*\*\s*(@[a-z]+)(\s+\{(?!\}))?|\{(@[a-z]+)/dgimu);
					for (const mt of mtAll) {
						if (mt[3]) {
							const [start, end] = mt.indices![3]!;
							decorations.push(doctagMark.range(f + start + 2, f + end + 2));
						} else {
							markDocTagType(decorations, f + 2, mt);
						}
					}
				}
			},
		});
	}
	return Decoration.set(decorations);
};

export const markGlobalsAndDocTagPlugin = (cm?: CodeMirror6): Extension => ViewPlugin.fromClass(
	class implements PluginValue {
		declare tree;
		declare decorations;

		constructor({state, visibleRanges}: EditorView) {
			this.tree = syntaxTree(state);
			this.decorations = markGlobalsAndDocTag(this.tree, visibleRanges, state, cm);
		}

		update({docChanged, viewportChanged, state, view: {visibleRanges}, transactions}: ViewUpdate): void {
			const tree = syntaxTree(state);
			let flag: boolean;
			if (docChanged || viewportChanged || tree !== this.tree) {
				this.tree = tree;
				flag = true;
			} else {
				flag = transactions.some(tr => tr.effects.some(e => e.is(setDiagnosticsEffect)));
			}
			if (flag) {
				this.decorations = markGlobalsAndDocTag(tree, visibleRanges, state, cm);
			}
		}
	},
	{
		decorations(v) {
			return v.decorations;
		},
	},
);

export default (_?: unknown, cm?: CodeMirror6): Extension => [
	js(),
	jsCompletion,
	markGlobalsAndDocTagPlugin(cm),
];
