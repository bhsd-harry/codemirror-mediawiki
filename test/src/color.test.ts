import * as assert from 'assert';
import {syntaxTree} from '@codemirror/language';
import {discoverColors} from '../../dist/color.js';
import {createState} from './util.js';
import type {WidgetOptions} from '@bhsd/codemirror-css-color-picker';

const mockTest = (doc: string, result: WidgetOptions): void => {
	const state = createState(doc),
		tree = syntaxTree(state),
		widgets: WidgetOptions[] = [];
	tree.iterate({
		enter(node): void {
			const colors = discoverColors(tree, node, state.doc) as WidgetOptions[] | null;
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
				colorType: 'rgba',
				alpha: 0.7,
				color: [255, 0, 0],
				legacy: true,
				spaced: true,
			},
		);
	});
	it('hex', () => {
		mockTest(
			'<poem style="color: #00ff00ff"/>',
			{
				from: 20,
				to: 29,
				colorType: 'hex',
				alpha: 1,
				color: [0, 255, 0],
				legacy: false,
				spaced: false,
			},
		);
	});
	it('named parameter', () => {
		mockTest(
			'{{#tag:font|color=#f000}}',
			{
				from: 18,
				to: 23,
				colorType: 'hex',
				alpha: 0,
				color: [255, 0, 0],
				legacy: false,
				spaced: false,
			},
		);
	});
	it('anonymous parameter', () => {
		mockTest(
			'{{color|rgb(0 0 255 / 50%)}}',
			{
				from: 8,
				to: 26,
				colorType: 'rgb',
				alpha: 0.5,
				color: [0, 0, 255],
				legacy: false,
				spaced: true,
			},
		);
	});
	it('legacy hsl()', () => {
		mockTest(
			'{{color|1=hsla(0, 100%, 50%, 0.5)}}',
			{
				from: 10,
				to: 33,
				colorType: 'hsla',
				alpha: 0.5,
				color: [255, 0, 0],
				legacy: true,
				spaced: true,
			},
		);
	});
	it('modern hsl()', () => {
		mockTest(
			'{{{|hsl(0deg 100 50)}}}',
			{
				from: 4,
				to: 20,
				colorType: 'hsl',
				alpha: 1,
				color: [255, 0, 0],
				legacy: false,
				spaced: true,
			},
		);
	});
});
