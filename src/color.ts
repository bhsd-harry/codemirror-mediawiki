import {splitColors} from '@bhsd/common';
import {parseCallExpression, parseColorLiteral, makeColorPicker} from '@bhsd/codemirror-css-color-picker';
import type {Extension} from '@codemirror/state';
import type {WidgetOptions, DiscoverColors} from '@bhsd/codemirror-css-color-picker';

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
		.map(([s, start, end]): WidgetOptions | false | undefined => {
			const color = s.startsWith('#') ? parseColorLiteral(s) : parseCallExpression(s);
			return color && {
				...color,
				from: from + start,
				to: from + end,
			};
		}).filter(Boolean) as WidgetOptions[];
};

/**
 * Get the [colorPicker](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#colorpicker)
 * extension for Wikitext.
 */
export default (): Extension => makeColorPicker(discoverColors);
