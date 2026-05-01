import {EditorView} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import type {Extension} from '@codemirror/state';

const cursorWidth = '--cursor-width',
	cursorMargin = '--cursor-margin';

export default (): Extension => [
	EditorView.updateListener.of(({view, state: {selection}, docChanged, selectionSet, transactions}) => {
		if (docChanged || selectionSet) {
			const {head} = selection.main;
			let width = '1ch';
			if (view.lineBlockAt(head).to !== head) {
				const rect = view.coordsForChar(head);
				if (rect) {
					width = `${rect.right - rect.left}px`;
				}
			}
			const {node} = view.domAtPos(head),
				{dom: {style}} = view;
			style.setProperty(cursorWidth, width);
			style.setProperty(
				cursorMargin,
				getComputedStyle(node.nodeType === 3 ? node.parentElement! : node as HTMLElement).direction === 'ltr'
					? '0'
					: `-${width}`,
			);

			// 避免在行尾换行处显示块状光标
			if (!transactions.some(tr => tr.isUserEvent('select.blockCursor'))) {
				view.dispatch({
					selection: EditorSelection.create(
						selection.ranges.map(r => r.empty ? EditorSelection.cursor(r.head, 1) : r),
					),
					userEvent: 'select.blockCursor',
				});
			}
		}
	}),
	EditorView.baseTheme({
		'&light div.cm-cursor': {
			borderLeftColor: '#222',
		},
		'&dark div.cm-cursor': {
			borderLeftColor: '#fff',
		},
	}),
	EditorView.theme({
		'div.cm-cursor': {
			borderLeftWidth: `var(${cursorWidth},1ch)`,
			marginLeft: `var(${cursorMargin},${document.dir === 'ltr' ? '0' : '-1ch'})`,
			opacity: 0.3,
		},
	}),
];
