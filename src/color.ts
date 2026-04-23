import {splitColors, numToHex} from '@bhsd/common';
import {
	parseCallExpression,
	parseColorLiteral,
	ColorType,
	colorPickerTheme,
	makeColorPicker,
} from '@bhsd/codemirror-css-color-picker';
import type {Extension} from '@codemirror/state';
import type {WidgetOptions, DiscoverColors} from '@bhsd/codemirror-css-color-picker';

/**
 * @implements
 * @test
 */
export const discoverColors: DiscoverColors = (_, {from, to, name}, doc) => {
	if (
		!/mw-(?:(?:ext|html)tag-attribute-value|table-definition)/u.test(name)
		&& (
			!/mw-(?:template|parserfunction)(?:$|_)/u.test(name)
			|| !/[|=]/u.test(doc.sliceString(from - 1, from))
			|| !/[|\n]/u.test(doc.sliceString(to, to + 1)) && doc.sliceString(to, to + 2) !== '}}'
		)
		&& (
			!/mw-templatevariable(?:$|_)/u.test(name)
			|| doc.sliceString(from - 1, from) !== '|'
			|| doc.sliceString(to, to + 1) !== '|' && doc.sliceString(to, to + 3) !== '}}}'
		)
	) {
		return undefined;
	}
	return splitColors(doc.sliceString(from, to)).filter(([,,, isColor]) => isColor)
		.map(([s, start, end]): WidgetOptions | false => {
			const color = s.startsWith('#') ? parseColorLiteral(s) : parseCallExpression(s);
			if (!color) {
				return false;
			}
			let {alpha} = color;
			if (color.colorType !== ColorType.hex) {
				alpha &&= numToHex(parseFloat(alpha.slice(1)) / (alpha.endsWith('%') ? 100 : 1));
			}
			return {
				...color,
				colorType: ColorType.hex,
				alpha,
				from: from + start,
				to: from + end,
			};
		}).filter(options => options !== false);
};

export default [
	makeColorPicker({discoverColors}),
	colorPickerTheme,
] satisfies Extension;
