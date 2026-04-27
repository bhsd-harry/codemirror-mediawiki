import {splitColors} from '@bhsd/common';
import {parseCallExpression, parseColorLiteral, makeColorPicker} from '@bhsd/codemirror-css-color-picker';
import type {WidgetOptions, DiscoverColors} from '@bhsd/codemirror-css-color-picker';

/**
 * @implements
 * @test
 */
export const discoverColors: DiscoverColors = (_, {from, to, name}, doc) =>
	// HTML tag attribute values, including wikitext tables
	/mw-(?:(?:ext|html)tag-attribute-value|table-definition)/u.test(name)

	// template and parser function arguments, immediately following a pipe or equals sign,
	// and immediately preceding a pipe, newline, or closing braces
	|| /mw-(?:template|parserfunction)(?:$|_)/u.test(name)
	&& /[|=]/u.test(doc.sliceString(from - 1, from))
	&& (/[|\n]/u.test(doc.sliceString(to, to + 1)) || doc.sliceString(to, to + 2) === '}}')

	// variable defaults, immediately following a pipe, and immediately preceding a pipe or closing braces
	|| /mw-templatevariable(?:$|_)/u.test(name)
	&& doc.sliceString(from - 1, from) === '|'
	&& (doc.sliceString(to, to + 1) === '|' || doc.sliceString(to, to + 3) === '}}}')

		? splitColors(doc.sliceString(from, to)).filter(([,,, isColor]) => isColor)
			.map(([s, start, end]): WidgetOptions | false | undefined => {
				const color = s.startsWith('#') ? parseColorLiteral(s) : parseCallExpression(s);
				return color && {
					...color,
					from: from + start,
					to: from + end,
				};
			}).filter(Boolean) as WidgetOptions[]
		: undefined;

export default makeColorPicker(discoverColors);
