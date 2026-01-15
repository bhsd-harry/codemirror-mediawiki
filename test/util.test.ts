import * as assert from 'assert';
import {Text} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {escHTML, indexToPos, posToIndex, sliceDoc, braceStackUpdate, hasTag, leadingSpaces} from '../src/util';
import {createState} from './util';

const doc = Text.of([
	'First line.',
	'Second line.',
]);
const state = createState('{{a}}{{b}}'),
	node = syntaxTree(state).resolve(5, -1);

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
	it('has tag', () => {
		const types = new Set(['mw-em', 'mw-error']);
		const yes = (tag: string | string[]): void => {
				assert.ok(hasTag(types, tag));
			},
			no = (tag: string | string[]): void => {
				assert.ok(!hasTag(types, tag));
			};
		yes('mw-em');
		yes('mw-error');
		yes('em');
		yes('error');
		no('mw-strong');
		no('strong');
		yes(['mw-em', 'mw-strong']);
		yes(['em', 'strong']);
		no(['mw-strong', 'list']);
		no(['strong', 'list']);
	});
	it('leading spaces', () => {
		assert.strictEqual(leadingSpaces(' \t\n\t a'), ' \t\n\t ');
		assert.strictEqual(leadingSpaces(' \t\n\t '), ' \t\n\t ');
		assert.strictEqual(leadingSpaces('a'), '');
	});
});
