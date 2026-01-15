import {
	EditorSelection,
} from '@codemirror/state';
import type {
	EditorView,
} from '@codemirror/view';
import type {
	DocRange,
} from './fold';

export type ReplaceFunction = (str: string, range: DocRange) => string | [string, number, number?];

export const replaceSelections = (view: EditorView, func: ReplaceFunction): void => {
	const {state} = view;
	view.dispatch(state.changeByRange(range => {
		const {from, to} = range,
			result = func(state.sliceDoc(from, to), range);
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
