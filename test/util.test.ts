import * as assert from 'assert';
import {Text} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {
	escHTML,
	indexToPos,
	posToIndex,
	sliceDoc,
	braceStackUpdate,
	leadingSpaces,
	findTemplateName,
} from '../src/util';
import {createState} from './util';

const doc = Text.of([
	'First line.',
	'Second line.',
]);
const state = createState('{{a}}{{b}}'),
	node = syntaxTree(state).resolve(3, 1);

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
});
