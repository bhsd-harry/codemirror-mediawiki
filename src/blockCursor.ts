import {EditorView, layer, RectangleMarker} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import {cursorColor} from './constants.js';
import type {Extension} from '@codemirror/state';

const cursorMargin = '--cursor-margin',
	cursorCls = 'cm-blockCursor',
	eolCls = `${cursorCls}-eol`,
	layerCls = `${cursorCls}Layer`;

const getMargin = (dom: HTMLElement): string => getComputedStyle(dom).direction === 'ltr' ? '0' : '-1ch';

export default (): Extension => [
	layer({
		above: true,
		markers(view) {
			view.dom.style.setProperty(cursorMargin, getMargin(view.contentDOM));
			return view.state.selection.ranges.filter(({empty}) => empty).flatMap(r => {
				const {head} = r,
					isEOL = view.lineBlockAt(head).to === head;
				return RectangleMarker.forRange(
					view,
					cursorCls + (isEOL ? '-eol' : ''),
					isEOL ? r : EditorSelection.range(head, head + 1),
				);
			});
		},
		update({docChanged, selectionSet}, dom) {
			if (selectionSet) {
				dom.style.animationName = dom.style.animationName === 'cm-blink' ? 'cm-blink2' : 'cm-blink';
			}
			return docChanged || selectionSet;
		},
		class: layerCls,
	}),
	EditorView.theme({
		'.cm-cursorLayer': {
			display: 'none',
		},
		[`.${layerCls}`]: {
			pointerEvents: 'none',
			animation: 'steps(1) cm-blink 1.2s infinite',
			opacity: 0.3,
		},
		[`.${cursorCls}`]: {
			backgroundColor: `var(${cursorColor})`,
		},
		[`.${eolCls}`]: {
			borderLeft: `1ch solid var(${cursorColor})`,
			marginLeft: `var(${cursorMargin})`,
		},
	}),
];
