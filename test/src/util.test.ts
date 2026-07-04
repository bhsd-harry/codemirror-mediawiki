import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {Text} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {
	escHTML,
	indexToPos,
	posToIndex,
	sliceDoc,
	braceStackUpdate,
	markDocTagType,
	leadingSpaces,
	findTemplateName,
} from '../../dist/util.js';
import {createState} from './util.js';
import type {Decoration} from '@codemirror/view';
import type {Range} from '@codemirror/state';

const doc = Text.of([
	'First line.',
	'Second line.',
]);
const state = createState('{{a}}{{b}}'),
	node = syntaxTree(state).resolve(3, 1);

const jsTest = (str: string, results: [number, number][], end: number): void => {
	const decorations: Range<Decoration>[] = [],
		mt = /(@[a-z]+)(\s*\{)?/diu.exec(str)!;
	assert.strictEqual(markDocTagType(decorations, 0, mt), end, str);
	assert.deepStrictEqual(decorations.map(({from, to}) => [from, to]), results);
};
const luaTest = (str: string, results: [number, number][], end: number): void => {
	const decorations: Range<Decoration>[] = [],
		mt = /(@[a-z]+)(\s*\{)?/diu.exec(str)!;
	assert.strictEqual(markDocTagType(decorations, 0, mt, 1), end, str);
	assert.deepStrictEqual(decorations.map(({from, to}) => [from, to]), results);
};

describe('util functions', () => {
	it('HTML escape', () => {
		assert.strictEqual(escHTML('<a>&\nb</a>'), '&lt;a>&amp;<br>b&lt;/a>');
	});

	it('index to position', () => {
		assert.deepStrictEqual(indexToPos(doc, 13), {line: 1, character: 1});
	});

	it('position to index', () => {
		assert.strictEqual(posToIndex(doc, {line: 1, character: 1}), 13);
	});

	it('slice document', () => {
		assert.strictEqual(sliceDoc(state, node), '}}{{');
	});

	it('update brace stack', () => {
		assert.deepStrictEqual(braceStackUpdate(state, node), [1, -1]);
	});

	it('find template name and parameter name', () => {
		const complexState = createState('{{a<!-- A -->a|{{b|{{c{{d}}|e=1}}f=}}g=1}}');
		const mockTest = (pos: number, expected: [string | null, string | null]): void => {
			assert.deepStrictEqual(
				findTemplateName(complexState, syntaxTree(complexState).resolve(pos, 1)),
				expected,
			);
		};
		mockTest(39, ['aa', '']);
		mockTest(38, ['aa', '']);
		mockTest(34, ['b', '']);
		/** @todo should return `null` */
		mockTest(29, ['c', '']);
		mockTest(30, ['c', 'e=']);
	});

	it('leading spaces', () => {
		assert.strictEqual(leadingSpaces(' \t\n\t a'), ' \t\n\t ');
		assert.strictEqual(leadingSpaces(' \t\n\t '), ' \t\n\t ');
		assert.strictEqual(leadingSpaces('a'), '');
	});

	it('parse JSDoc tag', () => {
		jsTest(' @file test', [[1, 6]], 6);
		jsTest('@content {', [[0, 8]], 8);
		jsTest('@type {}}', [[0, 5]], 8);
		jsTest('@type {string|number}}', [[0, 5], [7, 20]], 21);
		jsTest('@param {{a: {b: string}}}}', [[0, 6], [8, 24]], 25);
	});

	it('parse LDoc tag', () => {
		luaTest(' @file test', [[1, 6]], 6);
		luaTest('@content {', [[0, 8]], 8);
		luaTest('@type {}}', [[0, 5], [6, 8]], 8);
		luaTest('@type {string|number}}', [[0, 5], [6, 21]], 21);
		luaTest('@param {{a: {b: string}}}}', [[0, 6], [7, 25]], 25);
	});
});
