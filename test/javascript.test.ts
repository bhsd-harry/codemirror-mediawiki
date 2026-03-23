import * as assert from 'assert';
import {javascript} from '@codemirror/lang-javascript';
import {html} from '@codemirror/lang-html';
import {vue} from '@codemirror/lang-vue';
import {json} from '@codemirror/lang-json';
import {syntaxTree} from '@codemirror/language';
import {markGlobalsAndDocTag, exclude} from '../src/javascript';
import {createState, convertRangeSet} from './util';
import type {EditorState} from '@codemirror/state';
import type {LanguageSupport} from '@codemirror/language';

const mockTest = (
	state: EditorState,
	[from = 0, to = state.doc.length]: [number?, number?],
	results: number[][],
): void => {
	const set = markGlobalsAndDocTag(syntaxTree(state), [{from, to}], state);
	assert.deepStrictEqual(convertRangeSet(set, state.doc.length), results);
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
				 * @param {{{a: number, b: string, c}}} obj
				 * @returns {}
				 * @internal
				 */`,
			state = createState(doc, javascript());
		mockTest(state, [], [[4, 9], [11, 34], [54, 60], [62, 89], [102, 110], [121, 130]]);
	});
	it('inline tag', () => {
		const doc = '/** value of {@link X} */',
			state = createState(doc, javascript());
		mockTest(state, [], [[14, 19]]);
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
					 * @param {{{a: number, b: string, c}}} obj
					 * @returns {}
					 * @internal
					 */</script>`,
				state = createState(doc, javascript());
			mockTest(state, [], [[12, 17], [19, 42], [64, 70], [72, 99], [113, 121], [133, 142]]);
		});
		it('inline tag', () => {
			const doc = '<script>/** value of {@link X} */</script>',
				state = createState(doc, javascript());
			mockTest(state, [], [[22, 27]]);
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
