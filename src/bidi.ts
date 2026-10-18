/**
 * @author MusikAnimal
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {EditorView, Direction, ViewPlugin, Decoration} from '@codemirror/view';
import {Prec} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {mwSelector} from './constants.js';
import {hasTag, getTypes} from './config.js';
import {getTag} from './matchTag.js';
import {pushDecoration} from './util.js';
import type {ViewUpdate, DecorationSet, PluginValue} from '@codemirror/view';
import type {Extension, Range} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {TagName} from './config';

const isolateSelector = '.cm-bidi-isolate',
	ltrSelector = '.cm-bidi-ltr',
	cls = isolateSelector.slice(1),
	isolateLTR = Decoration.mark({
		class: `${cls} ${ltrSelector.slice(1)}`,
		bidiIsolate: Direction.LTR,
	}),
	isolate = Decoration.mark({class: cls});

/**
 * 计算需要`unicode-bidi:isolate`的范围
 * @ignore
 * @test
 */
export const computeIsolates = ({visibleRanges, state, textDirection}: EditorView): DecorationSet => {
	const set: Range<Decoration>[] = [];
	if (textDirection === Direction.RTL) {
		for (const {from, to} of visibleRanges) {
			let node: SyntaxNode | null = syntaxTree(state).resolve(from, 1),
				td = 0,
				table = 0,
				parameter = 0;
			while (node && node.to <= to) {
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
				const {name, from: f, to: t, nextSibling} = node as SyntaxNode,
					types = getTypes(name);
				if (
					hasTag(types, ['exttagBracket', 'htmltagBracket'])
					&& state.sliceDoc(f, t).includes('<')
				) {
					const tag = getTag(state, nextSibling!);
					if (tag) {
						pushDecoration(set, isolateLTR, tag);
					}
				} else if (!td && !table && hasTag(types, 'tableDefinition')) {
					if (hasTag(types, ['mw-html-table', 'mw-html-tr'] as string[] as TagName[])) {
						table = state.doc.lineAt(f).to;
						pushDecoration(set, isolateLTR, f, table);
					} else {
						td = f;
					}
				} else if (table && f > table) {
					table = 0;
				} else if (td && hasTag(types, 'tableDelimiter2')) {
					pushDecoration(set, isolateLTR, td, f);
					td = 0;
				} else if (hasTag(types, ['templateDelimiter', 'parserfunctionDelimiter'])) {
					if (parameter) {
						pushDecoration(set, isolate, parameter, f);
					}
					parameter = t;
				} else if (parameter && hasTag(types, ['templateBracket', 'parserfunctionBracket'])) {
					if (state.sliceDoc(f, f + 1) === '}') {
						pushDecoration(set, isolate, parameter, f);
					}
					parameter = 0;
				}
				node = nextSibling;
			}
		}
	}
	return Decoration.set(set, true);
};

export default (): Extension => [
	ViewPlugin.fromClass(
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
	),
	EditorView.theme({
		[`${isolateSelector}, &[dir=rtl] ${mwSelector}template-name`]: {
			unicodeBidi: 'isolate',
		},
		[ltrSelector]: {
			direction: 'ltr',
			display: 'inline-block',
		},
	}),
] satisfies Extension;
