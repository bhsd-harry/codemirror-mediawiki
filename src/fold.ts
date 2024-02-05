import {showTooltip, keymap} from '@codemirror/view';
import {StateField} from '@codemirror/state';
import {foldEffect, ensureSyntaxTree, foldState, unfoldAll, unfoldEffect} from '@codemirror/language';
import type {EditorView, Tooltip} from '@codemirror/view';
import type {EditorState, StateEffect, Extension} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';

declare interface DocRange {
	from: number;
	to: number;
}

const isTemplateComponent = (s: string) => (node: SyntaxNode): boolean => node.type.name.includes(`-template-${s}`),
	isBracket = isTemplateComponent('bracket'),
	isDelimiter = isTemplateComponent('delimiter'),
	isTemplateName = isTemplateComponent('name'),
	isTemplate = (node: SyntaxNode | null): boolean =>
		node ? /-template[a-z\d-]+ground/u.test(node.type.name) && !isBracket(node) : false,
	stackUpdate = (state: EditorState, node: SyntaxNode): number =>
		state.sliceDoc(node.from, node.from + 1) === '{' ? 1 : -1;

/**
 * 寻找可折叠的范围
 * @param state EditorState
 * @param pos 字符位置
 * @param tree 语法树
 */
const foldable = (state: EditorState, pos: number, tree = ensureSyntaxTree(state, pos)): DocRange | null => {
	if (!tree) {
		return null;
	}
	let node = tree.resolve(pos, -1);
	if (!isTemplate(node)) {
		node = tree.resolve(pos, 1);
		if (!isTemplate(node)) {
			return null;
		}
	}
	let {prevSibling, nextSibling} = node,
		stack = 1,
		delimiter: SyntaxNode | null = isDelimiter(node) ? node : null;
	while (nextSibling) {
		if (isBracket(nextSibling)) {
			stack += stackUpdate(state, nextSibling);
			if (stack === 0) {
				break;
			}
		} else if (!delimiter && stack === 1 && isDelimiter(nextSibling)) {
			delimiter = nextSibling;
		}
		({nextSibling} = nextSibling);
	}
	if (!nextSibling) {
		return null;
	}
	stack = -1;
	while (prevSibling) {
		if (isBracket(prevSibling)) {
			stack += stackUpdate(state, prevSibling);
			if (stack === 0) {
				break;
			}
		} else if (stack === -1 && isDelimiter(prevSibling)) {
			delimiter = prevSibling;
		}
		({prevSibling} = prevSibling);
	}
	if (delimiter) {
		return {from: delimiter.from, to: nextSibling.from};
	}
	return null;
};

/**
 * 折叠范围
 * @param view EditorView
 * @param start 起始位置
 * @param end 结束位置
 */
const foldRanges = (view: EditorView, start: number, end: number): StateEffect<DocRange>[] => {
	const {state, viewport: {to}} = view,
		tree = ensureSyntaxTree(state, to),
		effects: StateEffect<DocRange>[] = [];
	let node: SyntaxNode | null | undefined = tree?.resolve(start, 1);
	while (node && node.from <= end) {
		if (isTemplate(node) && !isTemplateName(node)) {
			const range = foldable(state, node.to, tree);
			if (range) {
				effects.push(foldEffect.of(range));
				node = tree!.resolve(range.to, 1);
			}
			continue;
		}
		node = node.nextSibling;
	}
	return effects;
};

const fold = (view: EditorView, effects: StateEffect<DocRange>[]): boolean => {
	if (effects.length > 0) {
		view.dom.querySelector('.cm-tooltip-fold')?.remove();
		view.dispatch({effects});
		return true;
	}
	return false;
};

/**
 * 创建折叠提示
 * @param state EditorState
 */
const create = (state: EditorState): Tooltip | null => {
	const range = foldable(state, state.selection.main.head);
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
					dom.title = state.phrase('Fold template parameters');
					dom.dataset['from'] = String(from);
					dom.dataset['to'] = String(to);
					return {dom};
				},
			};
	}
	return null;
};

export const foldExtension: Extension[] = [
	StateField.define<Tooltip | null>({
		create,
		update(tooltip, {state, docChanged, selection}) {
			return docChanged || selection ? create(state) : tooltip;
		},
		provide(f) {
			return showTooltip.from(f);
		},
	}),
	keymap.of([
		{
			key: 'Ctrl-Shift-[',
			mac: 'Cmd-Alt-[',
			run(view): boolean {
				const {state} = view;
				return fold(view, state.selection.ranges.flatMap(({from, to}) => foldRanges(view, from, to)));
			},
		},
		{
			key: 'Ctrl-Shift-]',
			mac: 'Cmd-Alt-]',
			run(view): boolean {
				const {state} = view,
					{selection: {ranges}} = state,
					effects: StateEffect<DocRange>[] = [],
					folded = state.field(foldState);
				for (const {from, to} of ranges) {
					folded.between(from, to, (i, j) => {
						effects.push(unfoldEffect.of({from: i, to: j}));
					});
				}
				if (effects.length > 0) {
					view.dispatch({effects});
					return true;
				}
				return false;
			},
		},
		{key: 'Ctrl-Alt-]', run: unfoldAll},
	]),
];

/**
 * 点击提示折叠模板参数
 * @param view EditorView
 */
export const foldHandler = (view: EditorView) => (e: MouseEvent): void => {
	const dom = (e.target as Element).closest<HTMLElement>('.cm-tooltip-fold');
	if (dom) {
		e.preventDefault();
		const {dataset: {from, to}} = dom;
		view.dispatch({effects: foldEffect.of({from: Number(from), to: Number(to)})});
		dom.remove();
	}
};
