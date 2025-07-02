import * as assert from 'assert';
import {foldable, foldableLine} from '../src/fold';
import {createState} from './util';
import type {EditorView, BlockInfo} from '@codemirror/view';
import type {DocRange} from '../src/fold';

const inlineTest = (doc: string, pos: number, range: DocRange | false, refOnly?: boolean): void => {
		assert.deepStrictEqual(foldable(createState(doc), pos, undefined, refOnly), range);
	},
	blockTest = (text: string, line: number, range: DocRange | false): void => {
		const state = createState(text),
			{doc} = state;
		assert.deepStrictEqual(
			foldableLine(
				{
					state,
					viewport: {from: 0, to: text.length},
					viewportLineBlocks: new Array(doc.lines).fill(undefined)
						.map((_, i) => doc.line(i + 1) as DocRange as BlockInfo),
				} as EditorView,
				doc.line(line),
			),
			range,
		);
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
		blockTest(sections, 8, {from: 38, to: 40});
	});

	const table = `
 : {|
 |
 : {| id=table
 |-
 !
 |- id=tr
 |}`;
	it('table', () => {
		blockTest(table, 2, false);
		blockTest(table, 4, {from: 24, to: 41});
	});
});
