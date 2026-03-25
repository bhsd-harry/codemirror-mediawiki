import * as assert from 'assert';
import {getWikiKeymap} from '../src/keymap';
import {createDispatchableView} from './util';
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
