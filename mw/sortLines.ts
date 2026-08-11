/**
 * @author MusikAnimal
 * @license GPL-2.0-or-later
 * @see https://gerrit.wikimedia.org/g/mediawiki/extensions/CodeMirror
 */

import {EditorSelection} from '@codemirror/state';
import type {ChangeSpec, SelectionRange} from '@codemirror/state';
import type {EditorView, Command} from '@codemirror/view';

const collator = new Intl.Collator();

const compareAscending = (a: string, b: string): number => collator.compare(a, b),
	compareDescending = (a: string, b: string): number => collator.compare(b, a);

const sortLines = (view: EditorView, descending?: boolean): boolean => {
	const {selection: {ranges, mainIndex}, doc} = view.state;
	// Do nothing if no lines are selected.
	if (ranges.every(({empty}) => empty)) {
		return false;
	}
	const changes: ChangeSpec[] = [],
		newRanges: SelectionRange[] = [];
	let lastTo = -1;
	for (const range of ranges) {
		const {empty, from: f, to: t} = range;
		if (empty) {
			newRanges.push(range);
			continue;
		}
		let endLine = doc.lineAt(t);
		// If the cursor ends at the start of a trailing line, exclude that trailing line.
		if (endLine.from === t) {
			endLine = doc.line(endLine.number - 1);
		}
		const {from} = doc.lineAt(f),
			{to} = endLine;
		// Sorting preserves the chunk's length, so these offsets stay valid post-change.
		newRanges.push(EditorSelection.range(from, to));
		if (from <= lastTo || endLine.from === from) {
			continue;
		}
		lastTo = to;
		const text = doc.sliceString(from, to),
			insert = text.split('\n').sort(descending ? compareDescending : compareAscending)
				.join('\n');
		if (insert !== text) {
			changes.push({from, to, insert});
		}
	}
	view.dispatch({changes, selection: EditorSelection.create(newRanges, mainIndex)});
	return true;
};

export const sortAscending: Command = view => sortLines(view),
	sortDescending: Command = view => sortLines(view, true);
