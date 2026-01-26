import * as assert from 'assert';
import {Direction} from '@codemirror/view';
import {computeIsolates} from '../src/bidi';
import {createState, convertRangeSet} from './util';
import type {EditorView} from '@codemirror/view';

const mockTest = (doc: string, ranges: number[][]): void => {
	const state = createState(doc),
		view = {
			visibleRanges: [{from: 0, to: doc.length}],
			state,
			textDirection: Direction.RTL,
		} as Partial<EditorView> as EditorView,
		set = computeIsolates(view);
	assert.deepStrictEqual(convertRangeSet(set, doc.length), ranges);
};

describe('bidiIsolation', () => {
	it('HTML tag', () => {
		mockTest(
			`<p
id="p"
class="p"
>`,
			[[0, 21]],
		);
	});
	it('extension tag', () => {
		mockTest(
			`<poem
compact
id="poem"
>`,
			[[0, 25]],
		);
	});
	it('table', () => {
		mockTest(
			`{| id="table" class="table"
|- id="tr" class="tr"
| id="td" rowspan=1 |
|}`,
			[
				[3, 27],
				[31, 49],
				[52, 70],
			],
		);
	});
	it('template parameter', () => {
		mockTest(
			`{{ template
| anonymous 1
anonymous 2
| 1 = parameter 1
parameter 2
}}`,
			[
				[13, 38],
				[39, 68],
			],
		);
	});
	it('parser function', () => {
		mockTest(
			`{{ #if: anonymous 1
anonymous 2
| anonymous 3
anonymous 4
}}`,
			[
				[7, 32],
				[33, 58],
			],
		);
	});
});
