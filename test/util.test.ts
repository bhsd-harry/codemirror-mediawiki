import * as assert from 'assert';
import {Text} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {
	escHTML,
	indexToPos,
	posToIndex,
	sliceDoc,
	braceStackUpdate,
	hasTag,
	leadingSpaces,
	findTemplateName,
} from '../src/util';
import {tokens} from '../src/config';
import {createState} from './util';
import type {TagName} from '../src/config';

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

	it('find template name', () => {
		const complexState = createState('{{a<!-- A -->a|{{b|{{c{{d}}|e=}}f=}}g=}}');
		assert.strictEqual(
			findTemplateName(complexState, syntaxTree(complexState).resolve(37)),
			'aa',
		);
		assert.strictEqual(
			findTemplateName(complexState, syntaxTree(complexState).resolve(33)),
			'b',
		);
		/** @todo should return `null` */
		assert.strictEqual(
			findTemplateName(complexState, syntaxTree(complexState).resolve(29)),
			'c',
		);
	});

	it('has tag', () => {
		const types = new Set([tokens.em, tokens.error]);
		const yes = (tag: string | string[]): void => {
				assert.ok(hasTag(types, tag as TagName | TagName[]));
			},
			no = (tag: string | string[]): void => {
				assert.ok(!hasTag(types, tag as TagName | TagName[]));
			};
		yes(tokens.em);
		yes(tokens.error);
		yes('em');
		yes('error');
		no(tokens.strong);
		no('strong');
		yes([tokens.em, tokens.strong]);
		yes(['em', 'strong']);
		no([tokens.strong, 'list']);
		no(['strong', 'list']);
	});

	it('leading spaces', () => {
		assert.strictEqual(leadingSpaces(' \t\n\t a'), ' \t\n\t ');
		assert.strictEqual(leadingSpaces(' \t\n\t '), ' \t\n\t ');
		assert.strictEqual(leadingSpaces('a'), '');
	});
});
