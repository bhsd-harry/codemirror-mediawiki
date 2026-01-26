import {
	javascript as js,
	javascriptLanguage,
	scopeCompletionSource,
	localCompletionSource,
} from '@codemirror/lang-javascript';
import {ViewPlugin, Decoration} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {builtin} from 'globals/globals.json';
import type {Extension, Range, EditorState} from '@codemirror/state';
import type {PluginValue, EditorView, ViewUpdate, DecorationSet} from '@codemirror/view';
import type {CompletionContext} from '@codemirror/autocomplete';
import type {Tree} from '@lezer/common';
import type {DocRange} from './fold';

export const jsCompletion = javascriptLanguage.data.of({autocomplete: scopeCompletionSource(globalThis)});

const globals = Decoration.mark({class: 'cm-globals'});

/**
 * 高亮显示全局变量
 * @ignore
 * @test
 */
export const markGlobals = (
	tree: Tree,
	visibleRanges: readonly DocRange[],
	state: EditorState,
): DecorationSet => {
	const decorations: Range<Decoration>[] = [];
	for (const {from, to} of visibleRanges) {
		tree.iterate({
			from,
			to,
			enter({type, from: f, to: t}) {
				const name = state.sliceDoc(f, t);
				if (type.is('VariableName') && name in builtin) {
					const completions = localCompletionSource({state, pos: t, explicit: true} as CompletionContext);
					if (!completions?.options.some(({label}) => label === name)) {
						decorations.push(globals.range(f, t));
					}
				}
			},
		});
	}
	return Decoration.set(decorations);
};

export default (): Extension => [
	js(),
	jsCompletion,
	ViewPlugin.fromClass(
		class implements PluginValue {
			declare tree;
			declare decorations;

			constructor({state, visibleRanges}: EditorView) {
				this.tree = syntaxTree(state);
				this.decorations = markGlobals(this.tree, visibleRanges, state);
			}

			update({docChanged, viewportChanged, state, view: {visibleRanges}}: ViewUpdate): void {
				const tree = syntaxTree(state);
				if (docChanged || viewportChanged || tree !== this.tree) {
					this.tree = tree;
					this.decorations = markGlobals(tree, visibleRanges, state);
				}
			}
		},
		{
			decorations(v) {
				return v.decorations;
			},
		},
	),
];
