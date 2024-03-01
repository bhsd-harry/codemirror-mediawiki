import {showTooltip, keymap} from '@codemirror/view';
import {StateField} from '@codemirror/state';
import {foldEffect, ensureSyntaxTree, foldedRanges, unfoldAll, unfoldEffect, codeFolding} from '@codemirror/language';
import type {EditorView, Tooltip} from '@codemirror/view';
import type {EditorState, StateEffect, Extension} from '@codemirror/state';
import type {SyntaxNode, Tree} from '@lezer/common';

declare interface DocRange {
	from: number;
	to: number;
}

const isTemplateComponent = (s: string) => ({name}: SyntaxNode): boolean => name.includes(`-template-${s}`),
	isBracket = isTemplateComponent('bracket'),
	isDelimiter = isTemplateComponent('delimiter'),
	isTemplate = (node: SyntaxNode | null): boolean =>
		node ? /-template[a-z\d-]+ground/u.test(node.name) && !isBracket(node) : false,
	stackUpdate = (state: EditorState, node: SyntaxNode): 1 | -1 =>
		state.sliceDoc(node.from, node.from + 1) === '{' ? 1 : -1;

/**
 * 寻找可折叠的范围
 * @param state
 * @param pos 字符位置
 * @param node 语法树节点
 * @param tree 语法树
 */
function foldable(state: EditorState, pos: number): DocRange | null;
function foldable(state: EditorState, node: SyntaxNode, tree: Tree): DocRange | null;
function foldable(state: EditorState, posOrNode: number | SyntaxNode, tree?: Tree | null): DocRange | null {
	if (typeof posOrNode === 'number') {
		tree = ensureSyntaxTree(state, posOrNode); // eslint-disable-line no-param-reassign
	}
	if (!tree) {
		return null;
	}
	let node: SyntaxNode;
	if (typeof posOrNode === 'number') {
		node = tree.resolve(posOrNode, -1);
		if (!isTemplate(node)) {
			node = tree.resolve(posOrNode, 1);
		}
	} else {
		node = posOrNode;
	}
	if (!isTemplate(node)) {
		return null;
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
	const from = delimiter?.to,
		to = nextSibling.from;
	if (from && from < to) {
		return {from, to};
	}
	return null;
}

/**
 * 创建折叠提示
 * @param state
 */
const create = (state: EditorState): Tooltip | null => {
	const {selection: {main: {head}}} = state,
		range = foldable(state, head);
	if (range) {
		const {from, to} = range;
		let folded = false;
		foldedRanges(state).between(from, to, (i, j) => {
			if (i === from && j === to) {
				folded = true;
			}
		});
		return folded // eslint-disable-line @typescript-eslint/no-unnecessary-condition
			? null
			: {
				pos: head,
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
	codeFolding({
		placeholderDOM(view) {
			const element = document.createElement('span');
			element.textContent = '…';
			element.setAttribute('aria-label', 'folded code');
			element.title = view.state.phrase('unfold');
			element.className = 'cm-foldPlaceholder';
			element.onclick = ({target}): void => {
				const pos = view.posAtDOM(target as Node),
					{state} = view,
					{selection} = state;
				foldedRanges(state).between(pos, pos, (from, to) => {
					if (from === pos) {
						view.dispatch({effects: unfoldEffect.of({from, to}), selection});
					}
				});
			};
			return element;
		},
	}),
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
				const {state} = view,
					tree = ensureSyntaxTree(state, view.viewport.to);
				if (!tree) {
					return false;
				}
				const effects: StateEffect<DocRange>[] = [],
					{selection: {ranges}} = state;
				let anchor = Math.max(...ranges.map(({to}) => to));
				for (const {from, to, empty} of ranges) {
					let node: SyntaxNode | null | undefined;
					if (empty) {
						node = tree.resolve(from, -1);
					}
					if (!node || !isTemplate(node)) {
						node = tree.resolve(from, 1);
					}
					while (node && node.from <= to) {
						const range = foldable(state, node, tree);
						if (range) {
							effects.push(foldEffect.of(range));
							node = tree.resolve(range.to, 1);
							anchor = Math.max(anchor, range.to);
							continue;
						}
						node = node.nextSibling;
					}
				}
				if (effects.length > 0) {
					view.dom.querySelector('.cm-tooltip-fold')?.remove();
					view.dispatch({effects, selection: {anchor}});
					return true;
				}
				return false;
			},
		},
		{
			key: 'Ctrl-Shift-]',
			mac: 'Cmd-Alt-]',
			run(view): boolean {
				const {state} = view,
					{selection} = state,
					effects: StateEffect<DocRange>[] = [],
					folded = foldedRanges(state);
				for (const {from, to} of selection.ranges) {
					folded.between(from, to, (i, j) => {
						effects.push(unfoldEffect.of({from: i, to: j}));
					});
				}
				if (effects.length > 0) {
					view.dispatch({effects, selection});
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
 * @param view
 */
export const foldHandler = (view: EditorView) => (e: MouseEvent): void => {
	const dom = (e.target as Element).closest<HTMLElement>('.cm-tooltip-fold');
	if (dom) {
		e.preventDefault();
		const {dataset} = dom,
			from = Number(dataset['from']),
			to = Number(dataset['to']);
		view.dispatch({
			effects: foldEffect.of({from, to}),
			selection: {anchor: to},
		});
		dom.remove();
	}
};
