import {splitColors} from '@bhsd/common';
import {colorsNamed} from '@bhsd/common/color';
import {makeColorPicker} from '@bhsd/codemirror-css-color-picker';
import type {DiscoverColors} from '@bhsd/codemirror-css-color-picker';
import type {DocRange} from './util';

const colorNames = Object.keys(colorsNamed);

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

		? splitColors(doc.sliceString(from, to), name.includes('mw-css') && colorNames)
			.filter(([,,, isColor]) => isColor)
			.map(([, start, end]): DocRange => ({
				from: from + start,
				to: from + end,
			}))
		: undefined;

export default makeColorPicker(discoverColors);
