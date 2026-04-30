import {EditorView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';

const cursorWidth = '--cursor-width',
	cursorMargin = '--cursor-margin';

export default (): Extension => [
	EditorView.updateListener.of(({view, state: {selection: {main: {head}}}, docChanged, selectionSet}) => {
		if (docChanged || selectionSet) {
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
