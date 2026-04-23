import * as assert from 'assert';
import {syntaxTree} from '@codemirror/language';
import {ColorType} from '@bhsd/codemirror-css-color-picker';
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
				alpha: 'b3',
				color: '#ff0000',
				colorType: ColorType.hex,
			},
		);
	});
	it('hex', () => {
		mockTest(
			'<poem style="color: #00ff00ff"/>',
			{
				from: 20,
				to: 29,
				alpha: 'ff',
				color: '#00ff00',
				colorType: ColorType.hex,
			},
		);
	});
	it('named parameter', () => {
		mockTest(
			'{{#tag:font|color=#f000}}',
			{
				from: 18,
				to: 23,
				alpha: '00',
				color: '#ff0000',
				colorType: ColorType.hex,
			},
		);
	});
	it('anonymous parameter', () => {
		mockTest(
			'{{color|rgb(0 0 255 / 50%)}}',
			{
				from: 8,
				to: 26,
				alpha: '80',
				color: '#0000ff',
				colorType: ColorType.hex,
			},
		);
	});
	it('legacy hsl()', () => {
		mockTest(
			'{{color|1=hsla(0, 100%, 50%, 0.5)}}',
			{
				from: 10,
				to: 33,
				alpha: '80',
				color: '#ff0000',
				colorType: ColorType.hex,
			},
		);
	});
	it('modern hsl()', () => {
		mockTest(
			'{{{|hsl(0deg 100 50)}}}',
			{
				from: 4,
				to: 20,
				alpha: '',
				color: '#ff0000',
				colorType: ColorType.hex,
			},
		);
	});
});
