import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {syntaxTree} from '@codemirror/language';
import {
	foldableInline,
	foldableLine,
	traverse,
	updateAll,
	updateSelection,
	buildMarkers,
	mySelectedLines,
	foldCommand,
	foldAt,
} from '../../dist/fold.js';
import {createState, convertRangeSet, setEditorSelection, createDispatchableView, posToRange} from './util.js';
import type {EditorView, BlockInfo} from '@codemirror/view';
import type {StateEffect} from '@codemirror/state';
import type {DocRange} from '../../dist/util';

const inlineTest = (doc: string, pos: number, range: DocRange | false, refOnly?: boolean): void => {
		assert.deepStrictEqual(foldableInline(createState(doc), pos, undefined, refOnly), range);
	},
	blockTest = (text: string, line: number, range: DocRange | false): EditorView => {
		const state = createState(text),
			{doc} = state,
			view = {
				state,
				viewport: {from: 0, to: text.length},
				viewportLineBlocks: Array.from({length: doc.lines}, (_, i) => doc.line(i + 1) as DocRange as BlockInfo),
			} as EditorView;
		assert.deepStrictEqual(
			foldableLine(view, doc.line(line)),
			range,
		);
		return view;
	},
	allTest = (doc: string, head: number, end: number | true, anchor: number, ranges: [number, number][]): void => {
		const state = createState(doc),
			tree = syntaxTree(state),
			effects: StateEffect<DocRange>[] = [],
			refOnly = end === true;
		assert.strictEqual(
			traverse(
				state,
				tree,
				effects,
				tree.topNode.firstChild,
				refOnly ? Infinity : end,
				head,
				refOnly || end === Infinity ? updateAll : updateSelection,
				refOnly,
			),
			anchor,
		);
		assert.deepStrictEqual(
			effects.map(e => e.value),
			ranges.map(([from, to]) => ({from, to})),
		);
	},
	commandTest = (
		doc: string,
		refOnly: boolean,
		head: number,
		effects: [number, number][],
		anchor: number,
	): Promise<void> => {
		const view = createDispatchableView(doc, [head], {selection: [anchor], effects});
		assert.strictEqual(foldCommand(refOnly)(view), true);
		return view.dispatched;
	},
	commandAtTest = (
		doc: string,
		ranges: (number | [number, number])[],
		effects: [number, number][],
		anchor?: number,
	): Promise<void> => {
		const view = createDispatchableView(
			doc,
			ranges,
			{
				...anchor !== undefined && {selection: [anchor]},
				effects,
			},
		);
		assert.strictEqual(foldAt(view), true);
		return view.dispatched;
	};

describe('codeFolding', () => {
	it('template', () => {
		inlineTest('{{ a | {{ b | c | c }} d', 17, {from: 13, to: 20});
		inlineTest('{{ a | {{ b | c | c }} d', 22, false);
		inlineTest('{{ a | {{ b | c | c }}}}', 6, {from: 6, to: 22});
	});
	it('extension tags', () => {
		inlineTest('<references><ref name=a>a</ref></references>', 24, {from: 24, to: 25});
		inlineTest('<references><ref name=a>a</ref></references>', 12, {from: 12, to: 31});
		inlineTest('<references><ref name=a>a</ref></references>', 31, {from: 12, to: 31});
		inlineTest('<references><ref name=a>a</ref>', 12, false);
	});
	it('<ref>/<references> only', () => {
		inlineTest('<nowiki>a</nowiki>', 8, {from: 8, to: 9});
		inlineTest('<nowiki>a</nowiki>', 8, false, true);
		inlineTest('<ref>a</ref>', 5, {from: 5, to: 6}, true);
		inlineTest('<references>a</references>', 12, {from: 12, to: 13}, true);
	});

	const sections = `
===a===

==b==
===c===

===d===
==e==

`;
	it('section', () => {
		blockTest(sections, 2, {from: 8, to: 9});
		blockTest(sections, 4, {from: 15, to: 32});
		blockTest(sections, 5, {from: 23, to: 24});
		blockTest(sections, 7, false);
		const view = blockTest(sections, 8, {from: 38, to: 40});
		assert.deepStrictEqual(
			convertRangeSet(buildMarkers(view), sections.length),
			[1, 10, 16, 33].map(posToRange),
		);
	});

	const table = `
 {|
 |
 : {|
 |-
 !
 |}
{{a|
{{{!}}
{{!}}
{{!}}}
}}`;
	it('table', () => {
		blockTest(table, 2, false);
		blockTest(table, 4, {from: 13, to: 20});
		const view = blockTest(table, 9, {from: 36, to: 42});
		assert.deepStrictEqual(
			convertRangeSet(buildMarkers(view), table.length),
			[8, 30].map(posToRange),
		);
	});

	it('fold all templates and extension tags', () => {
		allTest('<poem>foo</poem><nowiki>bar</nowiki>', 7, Infinity, 9, [[6, 9], [24, 27]]);
		allTest('<poem>foo</poem><nowiki>bar</nowiki>', 25, Infinity, 27, [[6, 9], [24, 27]]);
		allTest('<poem>foo</poem><nowiki>bar</nowiki>', 16, Infinity, 16, [[6, 9], [24, 27]]);
		allTest('<poem>foo</poem><nowiki>bar</nowiki>', 7, 23, 9, [[6, 9]]);
		allTest('<poem>foo</poem><nowiki>bar</nowiki>', 7, 24, 27, [[6, 9], [24, 27]]);
		allTest('{{foo|1}}{{bar|{{baz|2}}}}', 6, Infinity, 7, [[6, 7], [15, 24]]);
		allTest('{{foo|1}}{{bar|{{baz|2}}}}', 21, Infinity, 24, [[6, 7], [15, 24]]);
		allTest('{{foo|1}}{{bar|{{baz|2}}}}', 9, Infinity, 9, [[6, 7], [15, 24]]);
		allTest('{{foo|1}}{{bar|{{baz|2}}}}', 2, 10, 7, [[6, 7]]);
		allTest('{{foo|1}}{{bar|{{baz|2}}}}', 2, 11, 24, [[6, 7], [15, 24]]);
		allTest('{{foo|1}}{{bar|{{baz|2}}}}', 2, 18, 24, [[6, 7], [15, 24]]);
		allTest('<ref>{{foo|bar}}</ref>', 12, Infinity, 16, [[5, 16]]);
		allTest('<ref>{{foo|bar}}</ref>', 3, Infinity, 3, [[5, 16]]);
		allTest('<ref>{{foo|bar}}</ref>', 5, 5, 16, [[5, 16]]);
		allTest('{{foo|<ref>bar</ref>}}<poem>baz</poem>', 11, true, 14, [[11, 14]]);
		allTest('{{foo|<ref>bar</ref>}}<poem>baz</poem>', 7, true, 7, [[11, 14]]);
		allTest('{{foo|<ref>bar</ref>}}<poem>baz</poem>', 29, true, 29, [[11, 14]]);
	});

	it('selected lines', () => {
		const state = createState(sections, []),
			view = {
				state,
				lineBlockAt(pos: number) {
					return state.doc.lineAt(pos) as DocRange;
				},
			} as EditorView;
		const mockTest = (selection: [number, number][], lines: number[]): void => {
			setEditorSelection(state, selection);
			assert.deepStrictEqual(mySelectedLines(view).map(({from}) => from), lines);
		};
		mockTest([[8, 10], [32, 39]], [10, 39]);
		mockTest([[10, 8], [39, 32]], [1, 25]);
		mockTest([[0, 1], [10, 8]], [1]);
	});

	const mix = `<ref>foo</ref>{{bar|{{baz|1=}}}}
{|
|
|}
===

`;
	it('fold command', async () => {
		await commandTest(mix, false, 16, [[5, 8], [20, 30], [35, 37], [44, 46]], 16);
		await commandTest(mix, false, 20, [[5, 8], [20, 30], [35, 37], [44, 46]], 30);
		await commandTest(mix, false, 36, [[5, 8], [20, 30], [35, 37], [44, 46]], 37);
		await commandTest(mix, true, 6, [[5, 8]], 8);
	});

	it('fold at cursor', async () => {
		await commandAtTest(mix, [6, [20, 22], 35], [[5, 8], [26, 28]], 35);
		await commandAtTest(mix, [6, [19, 22]], [[5, 8], [20, 30]], 30);
		await commandAtTest(mix, [35, 44], [[35, 37]]);
		await commandAtTest(mix, [44], [[44, 46]]);
	});
});
