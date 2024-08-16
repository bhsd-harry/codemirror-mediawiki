/**
 * @author MusikAnimal
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {EditorView, Direction, ViewPlugin, Decoration} from '@codemirror/view';
import {Prec, RangeSetBuilder} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {getTag} from './matchTag';
import {tokens} from './config';
import type {ViewUpdate, DecorationSet, PluginValue} from '@codemirror/view';
import type {SyntaxNode} from '@lezer/common';

const isolateLTR = Decoration.mark({
		class: 'cm-bidi-isolate cm-bidi-ltr',
		bidiIsolate: Direction.LTR,
	}),
	isolate = Decoration.mark({class: 'cm-bidi-isolate'});

const computeIsolates = ({visibleRanges, state, textDirection}: EditorView): DecorationSet => {
	const set = new RangeSetBuilder<Decoration>();
	if (textDirection === Direction.RTL) {
		for (const {from, to} of visibleRanges) {
			let node: SyntaxNode | null = syntaxTree(state).resolve(from, 1),
				td = 0,
				table = 0,
				parameter = 0;
			while (node && node.to <= to) {
				const {name, from: f, to: t, nextSibling} = node;
				if (/-(?:ext|html)tag-bracket/u.test(name) && state.sliceDoc(f, f + 1) === '<') {
					const tag = getTag(state, nextSibling!);
					set.add(f, tag.to, isolateLTR);
				} else if (!td && !table && name.includes(tokens.tableDefinition)) {
					if (/-html-(?:table|tr)/u.test(name)) {
						table = state.doc.lineAt(f).to;
						set.add(f, table, isolateLTR);
					} else {
						td = f;
					}
				} else if (table && f > table) {
					table = 0;
				} else if (td && name.includes(tokens.tableDelimiter2)) {
					set.add(td, f, isolateLTR);
					td = 0;
				} else if (/-(?:template|parserfunction)-delimiter/u.test(name)) {
					if (parameter) {
						set.add(parameter, f, isolate);
					}
					parameter = t;
				} else if (parameter && /-(?:template|parserfunction)-bracket/u.test(name)) {
					if (state.sliceDoc(t - 1, t) === '}') {
						set.add(parameter, f, isolate);
					}
					parameter = 0;
				}
				node = node.nextSibling;
			}
		}
	}
	return set.finish();
};

export const bidiIsolation = ViewPlugin.fromClass(
	class implements PluginValue {
		declare isolates;
		declare tree;
		declare dir;

		constructor(view: EditorView) {
			this.isolates = computeIsolates(view);
			this.tree = syntaxTree(view.state);
			this.dir = view.textDirection;
		}

		update({docChanged, viewportChanged, state, view}: ViewUpdate): void {
			const tree = syntaxTree(state),
				{textDirection} = view;
			if (docChanged || viewportChanged || tree !== this.tree || textDirection !== this.dir) {
				this.isolates = computeIsolates(view);
				this.tree = tree;
				this.dir = textDirection;
			}
		}
	},
	{
		provide(plugin) {
			const access = (view: EditorView): DecorationSet => view.plugin(plugin)?.isolates ?? Decoration.none;
			return Prec.lowest([
				EditorView.decorations.of(access),
				EditorView.bidiIsolatedRanges.of(access),
			]);
		},
	},
);
