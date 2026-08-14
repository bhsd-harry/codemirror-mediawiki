import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {syntaxTree} from '@codemirror/language';
import {discoverColors} from '../../dist/color.js';
import {createState} from './util.js';
import type {DocRange} from '../../dist/util';

const mockTest = (doc: string, result: DocRange): void => {
	const state = createState(doc),
		tree = syntaxTree(state),
		widgets: DocRange[] = [];
	tree.iterate({
		enter(node): void {
			const colors = discoverColors(tree, node, state.doc) as DocRange[] | undefined;
			if (colors) {
				widgets.push(...colors);
			}
		},
		from: 0,
		to: doc.length,
	});
	assert.deepStrictEqual(widgets, [result]);
};

describe('colorPicker', () => {
	it('rgb()', () => {
		mockTest(
			'<p style="color: rgba(255, 0, 0, .7)">',
			{
				from: 17,
				to: 36,
			},
		);
	});
	it('hex', () => {
		mockTest(
			'<poem style="color: #00ff00ff"/>',
			{
				from: 20,
				to: 29,
			},
		);
	});
	it('named parameter', () => {
		mockTest(
			'{{#tag:font|color=#f000}}',
			{
				from: 18,
				to: 23,
			},
		);
	});
	it('anonymous parameter', () => {
		mockTest(
			'{{color|rgb(0 0 255 / 50%)}}',
			{
				from: 8,
				to: 26,
			},
		);
	});
	it('legacy hsl()', () => {
		mockTest(
			'{{color|1=hsla(0, 100%, 50%, 0.5)}}',
			{
				from: 10,
				to: 33,
			},
		);
	});
	it('modern hsl()', () => {
		mockTest(
			'{{{|hsl(0deg 100 50)}}}',
			{
				from: 4,
				to: 20,
			},
		);
	});
	it('hwb()', () => {
		mockTest(
			'{{{|hwb(120 0% 0%)}}}',
			{
				from: 4,
				to: 18,
			},
		);
	});
});
