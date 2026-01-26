import * as assert from 'assert';
import {javascript} from '@codemirror/lang-javascript';
import {syntaxTree} from '@codemirror/language';
import {markGlobals} from '../src/javascript';
import {createState, convertRangeSet} from './util';
import type {EditorState} from '@codemirror/state';

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
