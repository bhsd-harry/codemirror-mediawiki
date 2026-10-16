import {splitColors} from '@bhsd/common';
import {colorsNamed} from '@bhsd/common/color';
import {makeColorPicker} from '@bhsd/codemirror-css-color-picker';
import {hasTag, getTypes} from './config.js';
import type {Extension} from '@codemirror/state';
import type {DiscoverColors} from '@bhsd/codemirror-css-color-picker';
import type {DocRange} from './util';
import type {TagName} from './config';

const colorNames = Object.keys(colorsNamed);

/**
 * @implements
 */
export const discoverColors: DiscoverColors = (_, {from, to, name}, doc) => {
	const types = getTypes(name);
	// HTML tag attribute values, including wikitext tables
	return hasTag(types, ['extTagAttributeValue', 'htmlTagAttributeValue', 'tableDefinition'])

		// template and parser function arguments, immediately following a pipe or equals sign,
		// and immediately preceding a pipe, newline, or closing braces
		|| hasTag(types, ['template', 'parserFunction'])
		&& /[|=]/u.test(doc.sliceString(from - 1, from))
		&& (/[|\n]/u.test(doc.sliceString(to, to + 1)) || doc.sliceString(to, to + 2) === '}}')

		// variable defaults, immediately following a pipe, and immediately preceding a pipe or closing braces
		|| hasTag(types, 'templateVariable')
		&& doc.sliceString(from - 1, from) === '|'
		&& (doc.sliceString(to, to + 1) === '|' || doc.sliceString(to, to + 3) === '}}}')

		? splitColors(doc.sliceString(from, to), hasTag(types, 'mw-css' as TagName) && colorNames)
			.filter(([,,, isColor]) => isColor)
			.map(([, start, end]): DocRange => ({
				from: from + start,
				to: from + end,
			}))
		: undefined;
};

/**
 * Get the [colorPicker](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#colorpicker)
 * extension for Wikitext.
 */
export default (): Extension => makeColorPicker(discoverColors);
