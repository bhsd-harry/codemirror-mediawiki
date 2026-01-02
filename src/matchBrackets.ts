import {Decoration, EditorView} from '@codemirror/view';
import {bracketMatching, matchBrackets, syntaxTree} from '@codemirror/language';
import type {DecorationSet} from '@codemirror/view';
import type {Extension, StateField, Transaction, Range, Facet, EditorState} from '@codemirror/state';
import type {Config, MatchResult} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';

declare interface Selection {
	anchor: number;
	head: number;
}

const findEnclosingBrackets = (node: SyntaxNode, pos: number, brackets: string): MatchResult | undefined => {
	let parent: SyntaxNode | null = node;
	while (parent) {
		const {firstChild, lastChild} = parent;
		if (firstChild && lastChild) {
			const i = brackets.indexOf(firstChild.name),
				j = brackets.indexOf(lastChild.name);
			if (i !== -1 && j !== -1 && i % 2 === 0 && j % 2 === 1 && firstChild.from < pos && lastChild.to > pos) {
				return {start: firstChild, end: lastChild, matched: true};
			}
		}
		({parent} = parent);
	}
	return undefined;
};

const findEnclosingPlainBrackets = (
	state: EditorState,
	pos: number,
	config: Required<Config>,
): MatchResult | null => {
	const {brackets, maxScanDistance} = config,
		re = new RegExp(
			`[${
				[...brackets].filter((_, i) => i % 2).map(c => c === ']' ? String.raw`\]` : c).join('')
			}]`,
			'gu',
		),
		str = state.sliceDoc(pos, pos + maxScanDistance);
	let mt = re.exec(str);
	while (mt) {
		const result = matchBrackets(state, pos + mt.index + 1, -1, config),
			left = result?.end?.to;
		if (left !== undefined && left <= pos) {
			return result;
		}
		mt = re.exec(str);
	}
	return null;
};

const trySelectMatchingBrackets = (
	state: EditorState,
	pos: number,
	dir: 1 | -1,
	config?: Config,
	inside = false,
): Selection | false => {
	if (pos < 0) {
		return false;
	}
	const match = matchBrackets(state, pos, dir, config) || false,
		rightInside = dir === 1 === inside;
	return match && match.matched && {
		anchor: match.start[rightInside ? 'to' : 'from'],
		head: match.end![rightInside ? 'from' : 'to'],
	};
};

const selectMatchingBrackets = (
	state: EditorState,
	pos: number,
	config?: Config,
): Selection | false => trySelectMatchingBrackets(state, pos, -1, config)
	|| trySelectMatchingBrackets(state, pos, 1, config)
	|| trySelectMatchingBrackets(state, pos + 1, -1, config, true)
	|| trySelectMatchingBrackets(state, pos - 1, 1, config, true);

export default (configs?: Config): Extension => {
	const extension = bracketMatching(configs) as [
			Extension & {facet: Facet<Config, Required<Config>>},
			[StateField<DecorationSet>, Extension],
		],
		[{facet}, [field]] = extension;
	Object.assign(field, {
		updateF(value: DecorationSet, {state, docChanged, selection}: Transaction): DecorationSet {
			if (!docChanged && !selection) {
				return value;
			}
			const decorations: Range<Decoration>[] = [],
				config = state.facet(facet),
				{afterCursor, brackets, renderMatch} = config;
			for (const {empty, head} of state.selection.ranges) {
				if (!empty) {
					continue;
				}
				const tree = syntaxTree(state),
					match = matchBrackets(state, head, -1, config)
						|| head > 0 && matchBrackets(state, head - 1, 1, config)
						|| afterCursor && (
							matchBrackets(state, head, 1, config)
							|| head < state.doc.length && matchBrackets(state, head + 1, -1, config)
						)
						|| findEnclosingBrackets(tree.resolveInner(head, -1), head, brackets)
						|| afterCursor && findEnclosingBrackets(tree.resolveInner(head, 1), head, brackets)
						|| findEnclosingPlainBrackets(state, head, config);
				if (match) {
					decorations.push(...renderMatch(match, state));
				}
			}
			return Decoration.set(decorations, true);
		},
	});
	return [
		extension,
		EditorView.domEventHandlers({

			/**
			 * @ignore
			 * @todo 由于括号高亮的重绘，双击会被识别为两次单击，导致功能失效
			 */
			dblclick(e, view) {
				const pos = view.posAtCoords(e);
				if (pos === null) {
					return false;
				}
				const {state} = view,
					selection = selectMatchingBrackets(state, pos, state.facet(facet));
				if (selection) {
					view.dispatch({selection});
					return true;
				}
				return false;
			},
		}),
	];
};
