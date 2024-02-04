import {showTooltip, keymap} from '@codemirror/view';
import {StateField} from '@codemirror/state';
import {foldEffect, syntaxTree, foldState, codeFolding, foldAll, unfoldAll, foldService} from '@codemirror/language';
import type {EditorView, Tooltip} from '@codemirror/view';
import type {EditorState} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';

const isBracket = (node: SyntaxNode): boolean => node.type.name.includes('-template-bracket'),
	isTemplate = (node: SyntaxNode | null): boolean =>
		node ? /-template[a-z\d-]+ground/u.test(node.type.name) && !isBracket(node) : false,
	isDelimiter = (node: SyntaxNode): boolean => node.type.name.includes('-template-delimiter'),
	isTemplateName = (node: SyntaxNode): boolean => node.type.name.includes('-template-name'),
	stackUpdate = (state: EditorState, node: SyntaxNode): number =>
		state.sliceDoc(node.from, node.from + 1) === '{' ? 1 : -1;

/**
 * 寻找可折叠的范围
 * @param state EditorState
 * @param pos 字符位置
 */
const foldable = (state: EditorState, pos = state.selection.main.head): {from: number, to: number} | null => {
	const tree = syntaxTree(state);
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
 * 获取首个折叠范围
 * @param state EditorState
 * @param from 起始位置
 * @param to 结束位置
 */
const service = (state: EditorState, from: number, to: number): {from: number, to: number} | null => {
	const tree = syntaxTree(state);
	let node: SyntaxNode | null = tree.resolve(from, 1);
	while (node && node.to <= to && (!isTemplate(node) || isTemplateName(node))) {
		node = node.nextSibling;
	}
	return isTemplate(node) ? foldable(state, node!.to) : null;
};

/**
 * 创建折叠提示
 * @param state EditorState
 */
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

const cursorTooltipField = StateField.define<Tooltip | null>({
	create,
	update(tooltip, {state, docChanged, selection}) {
		return docChanged || selection ? create(state) : tooltip;
	},
	provide(f) {
		return showTooltip.from(f);
	},
});

export const foldExtension = [
	foldService.of(service),
	codeFolding(),
	cursorTooltipField,
	keymap.of([
		{
			key: 'Ctrl-Alt-[',
			run(view): boolean {
				view.dom.querySelector('.cm-tooltip-fold')?.remove();
				return foldAll(view);
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
