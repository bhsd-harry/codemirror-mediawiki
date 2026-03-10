import type {DecorationSet} from '@codemirror/view';
import type {Diagnostic} from '@codemirror/lint';
import type {CodeMirror6} from './codemirror';

const findDiagnostic = (deco: DecorationSet, head: number, anchor = head): Diagnostic | undefined => {
	let found: Diagnostic | undefined;
	deco.between(
		head,
		Infinity,
		(_, __, {spec: {diagnostics}}: {spec: {diagnostics: Diagnostic[]}}): undefined | false => {
			const next = diagnostics.sort((a, b) => a.from - b.from || a.to - b.to)
				.find(({from, to}) => from > head || from === head && to > anchor);
			if (next) {
				found = next;
				return false;
			}
			return undefined;
		},
	);
	return found;
};

/**
 * 选中下一个诊断的范围
 * @param cm CodeMirror6 实例
 */
export const nextDiagnostic = (cm: CodeMirror6): boolean => {
	const view = cm.view!,
		{state} = view,
		{diagnostics} = state.field(cm.getLintExtension()![2][0]),
		{from, to} = state.selection.main,
		next = findDiagnostic(diagnostics, from, to) ?? findDiagnostic(diagnostics, 0);
	if (!next || next.from === from && next.to === to) {
		return false;
	}
	view.dispatch({
		selection: {anchor: next.from, head: next.to},
		scrollIntoView: true,
	});
	return true;
};
