import type {
	EditorView,
} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import type {DocRange} from './fold';

export const replaceSelections = (
	view: EditorView,
	func: (str: string, range: DocRange) => string | [string, number, number?],
): void => {
	const {state} = view;
	view.dispatch(state.changeByRange(({from, to}) => {
		const result = func(state.sliceDoc(from, to), {from, to});
		if (typeof result === 'string') {
			return {
				range: EditorSelection.range(from, from + result.length),
				changes: {from, to, insert: result},
			};
		}
		const [insert, start, end = start] = result;
		return {
			range: EditorSelection.range(start, end),
			changes: {from, to, insert},
		};
	}));
};
