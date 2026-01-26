import {replaceSelections} from '../src/codemirror';
import {createDispatchableView} from './util';
import type {ReplaceFunction} from '../src/codemirror';

const mockTest = (
	func: ReplaceFunction,
	changes: string[],
	selection: (number | [number, number])[],
): Promise<void> => {
	const view = createDispatchableView(
		'foo\nbar\nbaz',
		[[0, 3], [4, 7], [8, 11]],
		{
			changes: changes.flatMap((text): (number | [number, string])[] => [1, [3, text]]).slice(1),
			selection,
		},
		[],
	);
	replaceSelections(view, func);
	return view.dispatched;
};

describe('CodeMirror6.replaceSelections', () => {
	it('auto select', async () => {
		await mockTest(
			(text, range) => text.repeat((range.to + 1) / 4),
			['foo', 'barbar', 'bazbazbaz'],
			[[0, 3], [4, 10], [11, 20]],
		);
	});
	it('manual select', async () => {
		await mockTest(
			(text, {from, to}) => [`(${text})`, from + 1, to + 1],
			['(foo)', '(bar)', '(baz)'],
			[[1, 4], [7, 10], [13, 16]],
		);
		await mockTest(
			(text, {to}) => [`(${text})`, to + 1],
			['(foo)', '(bar)', '(baz)'],
			[4, 10, 16],
		);
	});
});
