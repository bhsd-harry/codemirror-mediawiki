import {EditorView, layer, RectangleMarker} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import {getIndentUnit} from '@codemirror/language';
import {guideColor} from './constants.js';
import type {Extension} from '@codemirror/state';

const indentUnitNum = '--indent-unit',
	indentUnitVar = `var(${indentUnitNum})`,
	guideCls = 'cm-indent-guide';

const getIndentMarker = (view: EditorView, pos: number, width: number): RectangleMarker => {
	const marker = RectangleMarker.forRange(view, guideCls, EditorSelection.cursor(pos))[0]!;
	// @ts-expect-error set read-only property
	marker.width = width - 2;
	return marker;
};

export default (): Extension => [
	layer({
		above: false,
		markers(view) {
			const markers: RectangleMarker[] = [],
				{dom, visibleRanges, state} = view,
				{doc} = state,
				{lines} = doc;
			dom.style.setProperty(indentUnitNum, `${getIndentUnit(state)}ch`);
			for (const {from, to} of visibleRanges) {
				const blankLines: number[] = [];
				let prevWidth = 0;
				for (let line = doc.lineAt(from); line.from < to;) {
					const {text, from: f, number} = line;
					if (text.trim()) {
						const width = (view.coordsAtPos(f + /^\s*/u.exec(text)![0].length)?.left ?? NaN)
							- (view.coordsAtPos(f)?.left ?? NaN)
							|| 0;
						if (blankLines.length > 0) {
							const min = Math.min(prevWidth, width);
							if (min) {
								markers.push(...blankLines.map(pos => getIndentMarker(view, pos, min)));
								blankLines.length = 0;
							}
						}
						prevWidth = width;
						if (width) {
							markers.push(getIndentMarker(view, f, width));
						}
					} else {
						blankLines.push(f);
					}
					if (number === lines) {
						break;
					}
					line = doc.line(number + 1);
				}
			}
			return markers;
		},
		update({docChanged, viewportChanged}) {
			return docChanged || viewportChanged;
		},
	}),
	EditorView.theme({
		[`.${guideCls}`]: {
			backgroundImage: `linear-gradient(to left,var(${guideColor}) 0 2px,transparent 2px 100%)`,
			backgroundSize: `${indentUnitVar} 100%`,
			backgroundRepeat: 'repeat',
		},
	}),
];
