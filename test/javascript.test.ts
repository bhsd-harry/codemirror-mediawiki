import * as assert from 'assert';
import {javascript} from '@codemirror/lang-javascript';
import {html} from '@codemirror/lang-html';
import {vue} from '@codemirror/lang-vue';
import {syntaxTree} from '@codemirror/language';
import {markGlobals} from '../src/javascript';
import {createState, convertRangeSet} from './util';
import type {EditorState} from '@codemirror/state';
import type {LanguageSupport} from '@codemirror/language';

const mockTest = (state: EditorState, [from, to = state.doc.length]: [number, number?], results: number[][]): void => {
	const set = markGlobals(syntaxTree(state), [{from, to}], state);
	assert.deepStrictEqual(convertRangeSet(set, state.doc.length), results);
};

describe('JavaScript globals', () => {
	it('variables', () => {
		const doc = 'console.log(Reflect.ownKeys(Set), window);',
			state = createState(doc, javascript());
		mockTest(state, [0], [[12, 19], [28, 31]]);
		mockTest(state, [0, 19], [[12, 19]]);
		mockTest(state, [20], [[28, 31]]);
	});
	it('functions', () => {
		const doc = 'addEventListener("", () => escape());',
			state = createState(doc, javascript());
		mockTest(state, [0], [[27, 33]]);
		mockTest(state, [0, 19], []);
		mockTest(state, [21], [[27, 33]]);
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
};

sublangTest('HTML', html());
sublangTest('Vue', vue());
