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
 * 高亮显示全局变量
 * @ignore
 * @test
 */
export const markGlobals = (
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
				if (type.is('VariableName') && javascriptLanguage.isActiveAt(state, f) && allGlobals.has(name)) {
					const completions = localCompletionSource({state, pos: t, explicit: true} as CompletionContext);
					if (!completions?.options.some(({label}) => label === name)) {
						decorations.push(globalsMark.range(f, t));
					}
				}
			},
		});
	}
	return Decoration.set(decorations);
};

export const markGlobalsPlugin = (cm?: CodeMirror6): Extension => ViewPlugin.fromClass(
	class implements PluginValue {
		declare tree;
		declare decorations;

		constructor({state, visibleRanges}: EditorView) {
			this.tree = syntaxTree(state);
			this.decorations = markGlobals(this.tree, visibleRanges, state, cm);
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
				this.decorations = markGlobals(tree, visibleRanges, state, cm);
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
	markGlobalsPlugin(cm),
];
