import * as assert from 'assert';
import {syntaxTree} from '@codemirror/language';
import {getWikiKeymap, getExtNames} from '../../dist/keymap.js';
import {createDispatchableView, createState} from './util.js';
import type {Command} from '@codemirror/view';

const mockTest = (
	command: Command,
	doc: string,
	ranges: (number | [number, number])[],
	selection: (number | [number, number])[],
	changes: (number | [number, ...string[]])[],
): Promise<void> => {
	const view = createDispatchableView(doc, ranges, {selection, changes});
	assert.strictEqual(command(view), true);
	return view.dispatched;
};

const extTest = (doc: string, pos: number, expectedFrom: string[], expectedTo = expectedFrom): void => {
	const state = createState(doc);
	const test = (side: 1 | -1): void => {
		assert.deepStrictEqual(
			getExtNames(state, syntaxTree(state), pos, side),
			side === 1 ? expectedFrom : expectedTo,
			`pos: ${pos}, dir: ${side}\n${doc}`,
		);
	};
	test(1);
	test(-1);
};

describe('generate keymap', () => {
	it('single line', async () => {
		const {run} = getWikiKeymap({key: '', pre: 'pre', post: 'post', desc: ''});
		await mockTest(
			run!,
			'1\n2\n3\n4',
			[[0, 2], 5],
			[9, 15],
			[[2, 'pre1', 'post'], 3, [0, 'prepost'], 2],
		);
	});
	it('multiple lines', async () => {
		const {run} = getWikiKeymap({key: '', pre: 'pre', post: 'post', splitlines: true, desc: ''});
		await mockTest(
			run!,
			'1\n2\n3\n4',
			[[1, 2], 5],
			[[0, 17], [18, 26]],
			[[3, 'pre1post', 'pre2post'], 1, [1, 'pre3post'], 2],
		);
	});
});

describe('get the context of extension tags', () => {
	describe('no extension tags', () => {
		it('empty document', () => {
			extTest('', 0, []);
		});
		it('empty lines only', () => {
			extTest('\n\n', 1, []);
		});
		it('empty line', () => {
			extTest('1\n\n2', 2, []);
			extTest('[[1]]\n\n{{2}}', 6, []);
		});
		it('plain text, line end', () => {
			extTest('1\n2\n3', 3, []);
			extTest('1\n2\n3', 2, []);
		});
		it('plain text, not line end', () => {
			extTest('12', 1, []);
		});
		it('other tokens, line end', () => {
			extTest('1\n[[2]]\n3', 7, []);
			extTest('1\n[[2]]\n3', 2, []);
		});
		it('other tokens, not line end', () => {
			extTest('[[1]]', 2, []);
		});
	});
	describe('by the extension tag', () => {
		it('opening tag', () => {
			extTest('a<ref>', 1, []);
			extTest('<ref>a', 5, ['ref']);
			extTest('<ref>\n', 5, ['ref']);
			extTest('\n<ref>', 1, []);
		});
		it('closing tag', () => {
			extTest('<ref>a</ref>', 6, ['ref']);
			extTest('<ref></ref>a', 11, []);
			extTest('<ref></ref>\n', 11, []);
			extTest('<ref>\n</ref>', 6, ['ref']);
		});
		it('self-closing tag', () => {
			extTest('a<ref/>', 1, []);
			extTest('<ref/>a', 6, []);
			extTest('<ref/>\n', 6, []);
			extTest('\n<ref/>', 1, []);
		});
	});
	describe('between extension tags', () => {
		it('opening tag + opening tag', () => {
			extTest('<poem><ref>', 6, ['poem']);
			extTest('<poem><ref>', 5, []);
			extTest('<poem><ref>', 7, ['poem']);
		});
		it('opening tag + closing tag', () => {
			extTest('<poem><ref></poem>', 11, ['poem'], ['poem', 'ref']);
			extTest('<poem><ref></poem>', 10, ['poem']);
			extTest('<poem><ref></poem>', 12, []);
			extTest('<poem><ref></poem>', 13, []);
			extTest('<ref></ref>', 5, ['ref']);
			extTest('<ref></ref>', 4, []);
			extTest('<ref></ref>', 6, []);
			extTest('<ref></ref>', 7, []);
		});
		it('opening tag + self-closing tag', () => {
			extTest('<poem><ref/>', 6, ['poem']);
			extTest('<poem><ref/>', 5, []);
			extTest('<poem><ref/>', 7, ['poem']);
		});
		it('closing tag + opening tag', () => {
			extTest('<ref></ref><ref>', 11, []);
			extTest('<ref></ref><ref>', 10, []);
			extTest('<ref></ref><ref>', 12, []);
			extTest('<ref></ref><poem>', 11, []);
			extTest('<ref></ref><poem>', 10, []);
			extTest('<ref></ref><poem>', 12, []);
		});
		it('closing tag + closing tag', () => {
			extTest('<poem><ref></ref></poem>', 17, ['poem']);
			extTest('<poem><ref></ref></poem>', 16, ['poem']);
			extTest('<poem><ref></ref></poem>', 18, []);
			extTest('<poem><ref></ref></poem>', 19, []);
		});
		it('closing tag + self-closing tag', () => {
			extTest('<ref></ref><ref/>', 11, []);
			extTest('<ref></ref><ref/>', 10, []);
			extTest('<ref></ref><ref/>', 12, []);
			extTest('<ref></ref><poem/>', 11, []);
			extTest('<ref></ref><poem/>', 10, []);
			extTest('<ref></ref><poem/>', 12, []);
		});
		it('self-closing tag + opening tag', () => {
			extTest('<ref/><ref>', 6, []);
			extTest('<ref/><ref>', 5, []);
			extTest('<ref/><ref>', 4, []);
			extTest('<ref/><ref>', 7, []);
			extTest('<poem/><ref>', 7, []);
			extTest('<poem/><ref>', 6, []);
			extTest('<poem/><ref>', 5, []);
			extTest('<poem/><ref>', 8, []);
		});
		it('self-closing tag + closing tag', () => {
			extTest('<ref><poem/></ref>', 12, ['ref']);
			extTest('<ref><poem/></ref>', 11, ['ref']);
			extTest('<ref><poem/></ref>', 10, ['ref']);
			extTest('<ref><poem/></ref>', 13, []);
			extTest('<ref><poem/></ref>', 14, []);
		});
		it('self-closing tag + self-closing tag', () => {
			extTest('<ref/><ref/>', 6, []);
			extTest('<ref/><ref/>', 5, []);
			extTest('<ref/><ref/>', 4, []);
			extTest('<ref/><ref/>', 7, []);
			extTest('<ref/><poem/>', 6, []);
			extTest('<ref/><poem/>', 5, []);
			extTest('<ref/><poem/>', 4, []);
			extTest('<ref/><poem/>', 7, []);
		});
	});
	describe('inside the extension tag', () => {
		it('opening tag', () => {
			extTest('<ref>', 1, []);
			extTest('<ref>', 4, []);
			extTest('<ref name>', 9, []);
		});
		it('closing tag', () => {
			extTest('<ref> </ref>', 7, []);
			extTest('<ref> </ref>', 8, []);
			extTest('<ref></ref>', 10, []);
		});
		it('self-closing tag', () => {
			extTest('<ref/>', 1, []);
			extTest('<ref/>', 4, []);
			extTest('<ref/>', 5, []);
			extTest('<ref name/>', 9, []);
		});
		it('multiline tag', () => {
			extTest('<ref\n>', 4, []);
			extTest('<ref\n>', 5, []);
			extTest('<ref\n\n>', 5, []);
		});
	});
	describe('inside the extension content', () => {
		it('empty line', () => {
			extTest('<ref>\n\n</ref>', 6, ['ref']);
			extTest('<ref>\n\na</ref>', 6, ['ref']);
			extTest('<ref>\n\na\n</ref>', 6, ['ref']);
			extTest('<ref>a\n\n</ref>', 7, ['ref']);
			extTest('<ref>\na\n\n</ref>', 8, ['ref']);
		});
		it('line end', () => {
			extTest('<ref>a\n</ref>', 6, ['ref']);
			extTest('<ref>\na\n</ref>', 7, ['ref']);
			extTest('<ref>\na</ref>', 6, ['ref']);
			extTest('<ref>\na\n</ref>', 6, ['ref']);
		});
		it('not line end', () => {
			extTest('<ref>ab</ref>', 6, ['ref']);
		});
	});
	describe('by the extension tag with nested tags', () => {
		it('opening tag', () => {
			extTest('<poem>a<ref>', 7, ['poem']);
			extTest('<poem><ref>a', 11, ['poem', 'ref']);
			extTest('<poem><ref>\n', 11, ['poem', 'ref']);
			extTest('<poem>\n<ref>', 7, ['poem']);
		});
		it('closing tag', () => {
			extTest('<poem><ref>a</ref>', 12, ['poem', 'ref']);
			extTest('<poem><ref></ref>a', 17, ['poem']);
			extTest('<poem><ref></ref>\n', 17, ['poem']);
			extTest('<poem><ref>\n</ref>', 12, ['poem', 'ref']);
		});
		it('self-closing tag', () => {
			extTest('<poem>a<ref/>', 7, ['poem']);
			extTest('<poem><ref/>a', 12, ['poem']);
			extTest('<poem><ref/>\n', 12, ['poem']);
			extTest('<poem>\n<ref/>', 7, ['poem']);
		});
	});
	describe('between extension tags with nested tags', () => {
		it('opening tag + opening tag', () => {
			extTest('<indicator><poem><ref>', 17, ['indicator', 'poem']);
			extTest('<indicator><poem><ref>', 16, ['indicator']);
			extTest('<indicator><poem><ref>', 18, ['indicator', 'poem']);
		});
		it('opening tag + closing tag', () => {
			extTest('<indicator><poem><ref></poem>', 22, ['indicator', 'poem'], ['indicator', 'poem', 'ref']);
			extTest('<indicator><poem><ref></poem>', 21, ['indicator', 'poem']);
			extTest('<indicator><poem><ref></poem>', 23, ['indicator']);
			extTest('<indicator><poem><ref></poem>', 24, ['indicator']);
			extTest('<poem><ref></ref>', 11, ['poem', 'ref']);
			extTest('<poem><ref></ref>', 10, ['poem']);
			extTest('<poem><ref></ref>', 12, ['poem']);
			extTest('<poem><ref></ref>', 13, ['poem']);
		});
		it('opening tag + self-closing tag', () => {
			extTest('<indicator><poem><ref/>', 17, ['indicator', 'poem']);
			extTest('<indicator><poem><ref/>', 16, ['indicator']);
			extTest('<indicator><poem><ref/>', 18, ['indicator', 'poem']);
		});
		it('closing tag + opening tag', () => {
			extTest('<indicator><ref></ref><ref>', 22, ['indicator']);
			extTest('<indicator><ref></ref><ref>', 21, ['indicator']);
			extTest('<indicator><ref></ref><ref>', 23, ['indicator']);
			extTest('<indicator><ref></ref><poem>', 22, ['indicator']);
			extTest('<indicator><ref></ref><poem>', 21, ['indicator']);
			extTest('<indicator><ref></ref><poem>', 23, ['indicator']);
		});
		it('closing tag + closing tag', () => {
			extTest('<indicator><poem><ref></ref></poem>', 28, ['indicator', 'poem']);
			extTest('<indicator><poem><ref></ref></poem>', 27, ['indicator', 'poem']);
			extTest('<indicator><poem><ref></ref></poem>', 29, ['indicator']);
			extTest('<indicator><poem><ref></ref></poem>', 30, ['indicator']);
		});
		it('closing tag + self-closing tag', () => {
			extTest('<indicator><ref></ref><ref/>', 22, ['indicator']);
			extTest('<indicator><ref></ref><ref/>', 21, ['indicator']);
			extTest('<indicator><ref></ref><ref/>', 23, ['indicator']);
			extTest('<indicator><ref></ref><poem/>', 22, ['indicator']);
			extTest('<indicator><ref></ref><poem/>', 21, ['indicator']);
			extTest('<indicator><ref></ref><poem/>', 23, ['indicator']);
		});
		it('self-closing tag + opening tag', () => {
			extTest('<indicator><ref/><ref>', 17, ['indicator']);
			extTest('<indicator><ref/><ref>', 16, ['indicator']);
			extTest('<indicator><ref/><ref>', 15, ['indicator']);
			extTest('<indicator><ref/><ref>', 18, ['indicator']);
			extTest('<indicator><poem/><ref>', 18, ['indicator']);
			extTest('<indicator><poem/><ref>', 17, ['indicator']);
			extTest('<indicator><poem/><ref>', 16, ['indicator']);
			extTest('<indicator><poem/><ref>', 19, ['indicator']);
		});
		it('self-closing tag + closing tag', () => {
			extTest('<indicator><ref><poem/></ref>', 23, ['indicator', 'ref']);
			extTest('<indicator><ref><poem/></ref>', 22, ['indicator', 'ref']);
			extTest('<indicator><ref><poem/></ref>', 21, ['indicator', 'ref']);
			extTest('<indicator><ref><poem/></ref>', 24, ['indicator']);
			extTest('<indicator><ref><poem/></ref>', 25, ['indicator']);
		});
		it('self-closing tag + self-closing tag', () => {
			extTest('<indicator><ref/><ref/>', 17, ['indicator']);
			extTest('<indicator><ref/><ref/>', 16, ['indicator']);
			extTest('<indicator><ref/><ref/>', 15, ['indicator']);
			extTest('<indicator><ref/><ref/>', 18, ['indicator']);
			extTest('<indicator><ref/><poem/>', 17, ['indicator']);
			extTest('<indicator><ref/><poem/>', 16, ['indicator']);
			extTest('<indicator><ref/><poem/>', 15, ['indicator']);
			extTest('<indicator><ref/><poem/>', 18, ['indicator']);
		});
	});
	describe('inside the extension tag with nested tags', () => {
		it('opening tag', () => {
			extTest('<poem><ref>', 7, ['poem']);
			extTest('<poem><ref>', 10, ['poem']);
			extTest('<poem><ref name>', 15, ['poem']);
		});
		it('closing tag', () => {
			extTest('<poem><ref> </ref>', 13, ['poem']);
			extTest('<poem><ref> </ref>', 14, ['poem']);
			extTest('<poem><ref></ref>', 16, ['poem']);
		});
		it('self-closing tag', () => {
			extTest('<poem><ref/>', 7, ['poem']);
			extTest('<poem><ref/>', 10, ['poem']);
			extTest('<poem><ref/>', 11, ['poem']);
			extTest('<poem><ref name/>', 15, ['poem']);
		});
		it('multiline tag', () => {
			extTest('<poem><ref\n>', 10, ['poem']);
			extTest('<poem><ref\n>', 11, ['poem']);
			extTest('<poem><ref\n\n>', 11, ['poem']);
		});
	});
	describe('inside the extension content with nested tags', () => {
		it('empty line', () => {
			extTest('<poem><ref>\n\n</ref>', 12, ['poem', 'ref']);
			extTest('<poem><ref>\n\na</ref>', 12, ['poem', 'ref']);
			extTest('<poem><ref>\n\na\n</ref>', 12, ['poem', 'ref']);
			extTest('<poem><ref>a\n\n</ref>', 13, ['poem', 'ref']);
			extTest('<poem><ref>\na\n\n</ref>', 14, ['poem', 'ref']);
		});
		it('line end', () => {
			extTest('<poem><ref>a\n</ref>', 12, ['poem', 'ref']);
			extTest('<poem><ref>\na\n</ref>', 13, ['poem', 'ref']);
			extTest('<poem><ref>\na</ref>', 12, ['poem', 'ref']);
			extTest('<poem><ref>\na\n</ref>', 12, ['poem', 'ref']);
		});
		it('not line end', () => {
			extTest('<poem><ref>ab</ref>', 12, ['poem', 'ref']);
		});
	});
});
