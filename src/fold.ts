import {matchBrackets, foldEffect} from '@codemirror/language';
import type {EditorView} from '@codemirror/view';

/**
 * 寻找匹配的括号并折叠
 * @param view EditorView
 */
export const fold = (view: EditorView): boolean => {
	const {state} = view,
		{selection: {main: {head}}} = state,
		match = matchBrackets(state, head, -1)
		|| head > 0 && matchBrackets(state, head - 1, 1)
		|| matchBrackets(state, head, 1)
		|| head < state.doc.length && matchBrackets(state, head + 1, -1);
	if (match && match.matched) {
		const {start: {from, to}, end} = match;
		view.dispatch({
			effects: foldEffect.of(
				to < end!.to ? {from: to, to: end!.from} : {from: end!.to, to: from},
			),
		});
		return true;
	}
	return false;
};
