import {showTooltip} from '@codemirror/view';
import {StateField} from '@codemirror/state';
import {foldEffect, syntaxTree, foldState} from '@codemirror/language';
import type {EditorView, Tooltip} from '@codemirror/view';
import type {EditorState} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';

const isBracket = (node: SyntaxNode): boolean => node.type.name.includes('-template-bracket'),
	isTemplate = (node: SyntaxNode): boolean => /-template[a-z\d-]+ground/u.test(node.type.name) && !isBracket(node),
	isDelimiter = (node: SyntaxNode): boolean => /-template-delimiter/u.test(node.type.name);

const foldable = (state: EditorState): {from: number, to: number} | false => {
	const {selection: {main: {head}}} = state,
		tree = syntaxTree(state);
	let node = tree.resolve(head, -1);
	if (!isTemplate(node)) {
		node = tree.resolve(head, 1);
		if (!isTemplate(node)) {
			return false;
		}
	}
	let {prevSibling, nextSibling} = node,
		stack = 1,
		delimiter: SyntaxNode | null = isDelimiter(node) ? node : null;
	while (nextSibling) {
		if (isBracket(nextSibling)) {
			stack += state.sliceDoc(nextSibling.from, nextSibling.from + 1) === '{' ? 1 : -1;
			if (stack === 0) {
				break;
			}
		} else if (!delimiter && isDelimiter(nextSibling)) {
			delimiter = nextSibling;
		}
		({nextSibling} = nextSibling);
	}
	if (!nextSibling) {
		return false;
	}
	stack = -1;
	while (prevSibling) {
		if (isBracket(prevSibling)) {
			stack += state.sliceDoc(prevSibling.from, prevSibling.from + 1) === '{' ? 1 : -1;
			if (stack === 0) {
				break;
			}
		} else if (isDelimiter(prevSibling)) {
			delimiter = prevSibling;
		}
		({prevSibling} = prevSibling);
	}
	if (delimiter) {
		return {from: delimiter.from, to: nextSibling.from};
	}
	return false;
};

/**
 * 寻找匹配的括号并折叠
 * @param view EditorView
 */
export const fold = (view: EditorView): boolean => {
	const {state} = view,
		range = foldable(state);
	if (range) {
		view.dispatch({effects: foldEffect.of(range)});
		view.dom.querySelector('.cm-tooltip-fold')?.remove();
		return true;
	}
	return false;
};

const create = (state: EditorState): Tooltip | null => {
	const range = foldable(state);
	if (range) {
		const {from, to} = range;
		let folded = false;
		state.field(foldState).between(from, to, (i, j) => {
			if (i === from && j === to) {
				folded = true;
			}
		});
		return folded // eslint-disable-line @typescript-eslint/no-unnecessary-condition
			? null
			: {
				pos: state.selection.main.head,
				above: true,
				create: (): {dom: HTMLElement} => {
					const dom = document.createElement('div');
					dom.className = 'cm-tooltip-fold';
					dom.textContent = '\uff0d';
					dom.title = 'Fold template parameters';
					dom.dataset['from'] = String(from);
					dom.dataset['to'] = String(to);
					return {dom};
				},
			};
	}
	return null;
};

export const cursorTooltipField = StateField.define<Tooltip | null>({
	create,
	update(tooltip, {state, docChanged, selection}) {
		return docChanged || selection ? create(state) : tooltip;
	},
	provide(f) {
		return showTooltip.from(f);
	},
});

export const handler = (view: EditorView) => (e: MouseEvent): void => {
	const dom = (e.target as Element).closest<HTMLElement>('.cm-tooltip-fold');
	if (dom) {
		e.preventDefault();
		const {dataset: {from, to}} = dom;
		view.dispatch({effects: foldEffect.of({from: Number(from), to: Number(to)})});
		dom.remove();
	}
};
