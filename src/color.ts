import {splitColors} from '@bhsd/common';
import {EditorView} from '@codemirror/view';
import {
	parseCallExpression,
	parseColorLiteral,
	ColorType,
	colorPicker,
	makeColorPicker,
	wrapperClassName,
} from '@replit/codemirror-css-color-picker';
import type {Text, Extension} from '@codemirror/state';
import type {Tree} from '@lezer/common';
import type {StyleSpec} from 'style-mod';
import type {WidgetOptions} from '@replit/codemirror-css-color-picker';
import type {Addon} from './codemirror';

const discoverColors = (_: Tree, from: number, to: number, type: string, doc: Text): WidgetOptions[] | null => {
	if (!/mw-(?:(?:ext|html)tag-attribute-value|table-definition)/u.test(type)) {
		return null;
	}
	return splitColors(doc.sliceString(from, to)).filter(([,,, isColor]) => isColor).map(([s, start, end]) => {
		const color = s.startsWith('#') ? parseColorLiteral(s) : parseCallExpression(s);
		let alpha = color?.alpha;
		if (color?.colorType === ColorType.rgb) {
			alpha &&= Math.round(parseFloat(alpha) / (alpha.endsWith('%') ? 100 : 1) * 255)
				.toString(16).padStart(2, '0');
		}
		return color && {
			...color,
			colorType: 'hex',
			alpha,
			from: from + start,
			to: from + end,
		};
	}).filter(Boolean) as WidgetOptions[];
};

export default [
	(e?: [Extension, StyleSpec?]): Extension => {
		if (!e) {
			return [];
		}
		const extension = [...colorPicker as Extension[]];
		if (e.length > 0) {
			[extension[0]] = e;
		}
		return [
			extension,
			EditorView.theme({
				[`.${wrapperClassName}`]: {
					outline: 'none',
					...e[1],
				},
			}),
		];
	},
	{
		css: [],
		mediawiki: [
			makeColorPicker({discoverColors}),
			{marginLeft: '0.6ch'},
		],
	},
] as Addon<[Extension?, StyleSpec?]>;
