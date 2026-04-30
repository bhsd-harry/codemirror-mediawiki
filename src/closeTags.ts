import {EditorView} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {getTag, searchTag} from './matchTag.js';
import {hasTag} from './mediawiki.js';
import type {Extension} from '@codemirror/state';
import type {TagName} from './config';

const brackets: TagName[] = ['extTagBracket', 'htmlTagBracket'];

export default (): Extension => EditorView.inputHandler.of((view, from, to, text, insert) => {
	if (view.composing || view.state.readOnly || from !== to || text !== '>') {
		return false;
	}
	const base = insert(),
		{state} = base,
		tree = syntaxTree(state),
		closeTags = state.changeByRange(range => {
			const didType = state.sliceDoc(range.from - 1, range.to) === text,
				{head} = range,
				after = tree.resolveInner(head, -1);
			if (didType && hasTag(after.name, brackets) && head === after.from + 1) {
				const tag = getTag(state, after.prevSibling!);
				if (tag && !tag.closing && !tag.selfClosing && !searchTag(state, tag)) {
					return {
						range,
						changes: {from: head, to: head, insert: `</${tag.name}>`},
					};
				}
			}
			return {range};
		});
	if (closeTags.changes.empty) {
		return false;
	}
	view.dispatch([
		base,
		state.update(closeTags, {userEvent: 'input.complete', scrollIntoView: true}),
	]);
	return true;
});
