import * as assert from 'assert';
import {describe, it} from '@bhsd/test-util/mocha';
import {javascript} from '@codemirror/lang-javascript';
import {html} from '@codemirror/lang-html';
import {vue} from '@codemirror/lang-vue';
import {json} from '@bhsd/lezer-json';
import {syntaxTree} from '@codemirror/language';
import {markGlobalsAndDocTag, exclude} from '../../dist/javascript.js';
import {createState, convertFullRangeSet, filterFromRangeSet} from './util.js';
import type {EditorState} from '@codemirror/state';
import type {LanguageSupport} from '@codemirror/language';

const mockTest = (
	state: EditorState,
	[from = 0, to = state.doc.length]: [number?, number?],
	globals: [number, number][],
	tag: [number, number][] = [],
	type: [number, number][] = [],
	v: [number, number][] = [],
): void => {
	const set = markGlobalsAndDocTag(syntaxTree(state), [{from, to}], state),
		arr = convertFullRangeSet(set, state.doc.length);
	assert.deepStrictEqual(filterFromRangeSet(arr, 'cm-globals'), globals);
	assert.deepStrictEqual(filterFromRangeSet(arr, 'cm-doctag'), tag);
	assert.deepStrictEqual(filterFromRangeSet(arr, 'cm-doctag-type'), type);
	assert.deepStrictEqual(filterFromRangeSet(arr, 'cm-doctag-var'), v);
};

const excludeTest = (lang: () => LanguageSupport, doc: string, pos: number, result = false): void => {
	assert.strictEqual(exclude(createState(doc, lang()), pos), result);
};

describe('JavaScript globals', () => {
	it('variables', () => {
		const doc = 'console.log(Reflect.ownKeys(Set), window);',
			state = createState(doc, javascript());
		mockTest(state, [], [[12, 19], [28, 31]]);
		mockTest(state, [0, 19], [[12, 19]]);
		mockTest(state, [20], [[28, 31]]);
	});
	it('functions', () => {
		const doc = 'addEventListener("", () => escape());',
			state = createState(doc, javascript());
		mockTest(state, [], [[27, 33]]);
		mockTest(state, [0, 19], []);
		mockTest(state, [21], [[27, 33]]);
	});
});

describe('JSDoc', () => {
	it('block tag', () => {
		const doc = `/** @type {(string|Array.<string>)} */
				/**
				 * @param {{{a: number, b: string, c}}} obj - object
				 * @returns {} ret - return value
				 * @throws e - error
				 * @internal
				 */`,
			state = createState(doc, javascript());
		mockTest(
			state,
			[],
			[],
			[[4, 9], [54, 60], [111, 119], [149, 156], [174, 183]],
			[[11, 34], [62, 89]],
			[[91, 94], [123, 126], [157, 158]],
		);
	});
	it('inline tag', () => {
		const doc = '/** value of {@link X} */',
			state = createState(doc, javascript());
		mockTest(state, [], [], [[14, 19]]);
	});
});

const sublangTest = (name: string, lang: LanguageSupport): void => {
	describe(`JavaScript globals nested in ${name}`, () => {
		it('variables', () => {
			const doc = '<script>console.log(Reflect.ownKeys(Set), window);</script>',
				state = createState(doc, lang);
			mockTest(state, [8], [[20, 27], [36, 39]]);
			mockTest(state, [8, 27], [[20, 27]]);
			mockTest(state, [28], [[36, 39]]);
		});
		it('functions', () => {
			const doc = '<script>addEventListener("", () => escape());</script>',
				state = createState(doc, lang);
			mockTest(state, [8], [[35, 41]]);
			mockTest(state, [8, 27], []);
			mockTest(state, [29], [[35, 41]]);
		});
	});

	describe(`JSDoc nested in ${name}`, () => {
		it('block tag', () => {
			const doc = `<script>/** @type {(string|Array.<string>)} */
					/**
					 * @param {{{a: number, b: string, c}}} obj - object
					 * @returns {} ret - return value
					 * @throws e - error
					 * @internal
					 */</script>`,
				state = createState(doc, javascript());
			mockTest(
				state,
				[],
				[],
				[[12, 17], [64, 70], [122, 130], [161, 168], [187, 196]],
				[[19, 42], [72, 99]],
				[[101, 104], [134, 137], [169, 170]],
			);
		});
		it('inline tag', () => {
			const doc = '<script>/** value of {@link X} */</script>',
				state = createState(doc, javascript());
			mockTest(state, [], [], [[22, 27]]);
		});
	});
};

sublangTest('HTML', html());
sublangTest('Vue', vue());

describe('exclude JavaScript RegExp literal', () => {
	it('not JavaScript', () => {
		excludeTest(json, '{}', 1);
	});
	it('not JavaScript sublanguage', () => {
		excludeTest(html, '<br>', 1);
		excludeTest(vue, '<template></template>', 10);
	});
	it('not RegExp literal in JavaScript', () => {
		excludeTest(javascript, 'focus();', 1);
	});
	it('not RegExp literal in JavaScript sublanguage', () => {
		excludeTest(html, '<script>focus();</script>', 9);
		excludeTest(vue, '<script>focus();</script>', 9);
	});
	it('JavaScript RegExp literal', () => {
		excludeTest(javascript, '/a/;', 1, true);
	});
	it('JavaScript sublanguage RegExp literal', () => {
		excludeTest(html, '<script>/a/;</script>', 9, true);
		excludeTest(vue, '<script>/a/;</script>', 9, true);
	});
});
