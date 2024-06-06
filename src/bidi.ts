/**
 * @author MusikAnimal
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {EditorView, Direction, ViewPlugin, Decoration} from '@codemirror/view';
import {Prec, RangeSetBuilder} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {getTag} from './matchTag';
import modeConfig from './config';
import type {ViewUpdate, DecorationSet} from '@codemirror/view';
import type {SyntaxNode} from '@lezer/common';

const {tokens} = modeConfig;

const isolate = Decoration.mark({
	class: 'cm-bidi-isolate',
	bidiIsolate: Direction.LTR,
});

const computeIsolates = ({visibleRanges, state}: EditorView): DecorationSet => {
	const set = new RangeSetBuilder<Decoration>();
	for (const {from, to} of visibleRanges) {
		let node: SyntaxNode | null = syntaxTree(state).resolve(from, 1),
			td = 0,
			table = 0;
		while (node && node.to < to) {
			const {name, from: f, nextSibling} = node;
			if (/-(?:ext|html)tag-bracket/u.test(name) && state.sliceDoc(f, f + 1) === '<') {
				const tag = getTag(state, nextSibling!);
				set.add(f, tag.to, isolate);
			} else if (!td && !table && name.includes(tokens.tableDefinition)) {
				if (/-html-(?:table|tr)/u.test(name)) {
					table = state.doc.lineAt(f).to;
					set.add(f, table, isolate);
				} else {
					td = f;
				}
			} else if (table && f > table) {
				table = 0;
			} else if (td && name.includes(tokens.tableDelimiter2)) {
				set.add(td, f, isolate);
				td = 0;
			}
			node = node.nextSibling;
		}
	}
	return set.finish();
};

export default ViewPlugin.fromClass(
	class {
		declare isolates;
		declare tree;

		constructor(view: EditorView) {
			this.isolates = computeIsolates(view);
			this.tree = syntaxTree(view.state);
		}

		update({docChanged, viewportChanged, state, view}: ViewUpdate): void {
			const tree = syntaxTree(state);
			if (docChanged || viewportChanged || tree !== this.tree) {
				this.isolates = computeIsolates(view);
				this.tree = tree;
			}
		}
	},
	{
		provide(plugin) {
			const access = (view: EditorView): DecorationSet => view.plugin(plugin)?.isolates || Decoration.none;
			return Prec.lowest([
				EditorView.decorations.of(access),
				EditorView.bidiIsolatedRanges.of(access),
			]);
		},
	},
);
