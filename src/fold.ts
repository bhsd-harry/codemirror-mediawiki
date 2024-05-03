import {showTooltip, keymap} from '@codemirror/view';
import {StateField} from '@codemirror/state';
import {
	syntaxTree,
	ensureSyntaxTree,
	foldEffect,
	unfoldEffect,
	foldedRanges,
	unfoldAll,
	codeFolding,
	foldService,
} from '@codemirror/language';
import {modeConfig} from './config';
import type {EditorView, Tooltip} from '@codemirror/view';
import type {EditorState, StateEffect, Extension} from '@codemirror/state';
import type {SyntaxNode, Tree} from '@lezer/common';

export interface DocRange {
	from: number;
	to: number;
}

const isTemplateComponent = (s: keyof typeof modeConfig.tags) =>
		({name}: SyntaxNode): boolean => name.includes(modeConfig.tags[s]),

	/** Check if a SyntaxNode is a template bracket (`{{` or `}}`) */
	isBracket = isTemplateComponent('templateBracket'),

	/** Check if a SyntaxNode is a template delimiter (`|`) */
	isDelimiter = isTemplateComponent('templateDelimiter'),

	/**
	 * Check if a SyntaxNode is part of a template, except for the brackets
	 * @param node 语法树节点
	 */
	isTemplate = (node: SyntaxNode): boolean => /-template[a-z\d-]+ground/u.test(node.name) && !isBracket(node),

	/**
	 * Update the stack of opening (+) or closing (-) brackets
	 * @param state
	 * @param node 语法树节点
	 */
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
		// Find the initial template node on both sides of the position
		node = tree.resolve(posOrNode, -1);
		if (!isTemplate(node)) {
			node = tree.resolve(posOrNode, 1);
		}
	} else {
		node = posOrNode;
	}
	if (!isTemplate(node)) {
		// Not a template
		return null;
	}
	let {prevSibling, nextSibling} = node,
		/** The stack of opening (+) or closing (-) brackets */ stack = 1,
		/** The first delimiter */ delimiter: SyntaxNode | null = isDelimiter(node) ? node : null;
	while (nextSibling) {
		if (isBracket(nextSibling)) {
			stack += stackUpdate(state, nextSibling);
			if (stack === 0) {
				// The closing bracket of the current template
				break;
			}
		} else if (!delimiter && stack === 1 && isDelimiter(nextSibling)) {
			// The first delimiter of the current template so far
			delimiter = nextSibling;
		}
		({nextSibling} = nextSibling);
	}
	if (!nextSibling) {
		// The closing bracket of the current template is missing
		return null;
	}
	stack = -1;
	while (prevSibling) {
		if (isBracket(prevSibling)) {
			stack += stackUpdate(state, prevSibling);
			if (stack === 0) {
				// The opening bracket of the current template
				break;
			}
		} else if (stack === -1 && isDelimiter(prevSibling)) {
			// The first delimiter of the current template so far
			delimiter = prevSibling;
		}
		({prevSibling} = prevSibling);
	}
	const /** The end of the first delimiter */ from = delimiter?.to,
		/** The start of the closing bracket */ to = nextSibling.from;
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

/**
 * 执行折叠
 * @param view
 * @param effects 折叠
 * @param anchor 光标位置
 */
const execute = (view: EditorView, effects: StateEffect<DocRange>[], anchor: number): boolean => {
	if (effects.length > 0) {
		view.dom.querySelector('.cm-tooltip-fold')?.remove();
		// Fold the template(s) and update the cursor position
		view.dispatch({effects, selection: {anchor}});
		return true;
	}
	return false;
};

/**
 * The rightmost position of all selections, to be updated with folding
 * @param state
 */
const getAnchor = (state: EditorState): number => Math.max(...state.selection.ranges.map(({to}) => to));

/**
 * 折叠所有模板
 * @param state
 * @param tree 语法书
 * @param effects 折叠
 * @param node 语法书节点
 * @param end 终止位置
 * @param anchor 光标位置
 * @param update 更新光标位置
 */
const traverse = (
	state: EditorState,
	tree: Tree,
	effects: StateEffect<DocRange>[],
	node: SyntaxNode | null,
	end: number,
	anchor: number,
	update = (pos: number, {to}: DocRange): number => Math.max(pos, to),
): number => {
	/* eslint-disable no-param-reassign */
	while (node && node.from <= end) {
		const range = foldable(state, node, tree);
		if (range) {
			effects.push(foldEffect.of(range));
			node = tree.resolve(range.to, 1);
			// Update the anchor with the end of the last folded range
			anchor = update(anchor, range);
			continue;
		}
		node = node.nextSibling;
	}
	return anchor;
	/* eslint-enable no-param-reassign */
};

export const foldExtension: Extension = [
	codeFolding({
		placeholderDOM(view) {
			const element = document.createElement('span');
			element.textContent = '…';
			element.setAttribute('aria-label', 'folded code');
			element.title = view.state.phrase('unfold');
			element.className = 'cm-foldPlaceholder';
			element.addEventListener('click', ({target}) => {
				const pos = view.posAtDOM(target as Node),
					{state} = view,
					{selection} = state;
				foldedRanges(state).between(pos, pos, (from, to) => {
					if (from === pos) {
						// Unfold the template and redraw the selections
						view.dispatch({effects: unfoldEffect.of({from, to}), selection});
					}
				});
			});
			return element;
		},
	}),
	/** @see https://codemirror.net/examples/tooltip/ */
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
			// Fold the template at the selection/cursor
			key: 'Ctrl-Shift-[',
			mac: 'Cmd-Alt-[',
			run(view): boolean {
				const {state} = view,
					tree = ensureSyntaxTree(state, view.viewport.to);
				if (!tree) {
					return false;
				}
				const effects: StateEffect<DocRange>[] = [];
				let anchor = getAnchor(state);
				for (const {from, to, empty} of state.selection.ranges) {
					let node: SyntaxNode | null | undefined;
					if (empty) {
						// No selection, try both sides of the cursor position
						node = tree.resolve(from, -1);
					}
					if (!node || !isTemplate(node)) {
						node = tree.resolve(from, 1);
					}
					anchor = traverse(state, tree, effects, node, to, anchor);
				}
				return execute(view, effects, anchor);
			},
		},
		{
			// Fold all templates in the document
			key: 'Ctrl-Alt-[',
			run(view): boolean {
				const {state} = view,
					tree = syntaxTree(state),
					effects: StateEffect<DocRange>[] = [],
					anchor = traverse(
						state,
						tree,
						effects,
						tree.topNode.firstChild,
						Infinity,
						getAnchor(state),
						(pos, {from, to}) => from <= pos && to > pos ? to : pos,
					);
				return execute(view, effects, anchor);
			},
		},
		{
			// Unfold the template at the selection/cursor
			key: 'Ctrl-Shift-]',
			mac: 'Cmd-Alt-]',
			run(view): boolean {
				const {state} = view,
					{selection} = state,
					effects: StateEffect<DocRange>[] = [],
					folded = foldedRanges(state);
				for (const {from, to} of selection.ranges) {
					// Unfold any folded range at the selection
					folded.between(from, to, (i, j) => {
						effects.push(unfoldEffect.of({from: i, to: j}));
					});
				}
				if (effects.length > 0) {
					// Unfold the template(s) and redraw the selections
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

export const foldOnIndent: Extension = foldService.of(({doc, tabSize}, start, from) => {
	const {text, number} = doc.lineAt(start);
	if (!text.trim()) {
		return null;
	}
	const getIndent = (line: string): number => /^\s*/u.exec(line)![0].replace(/\t/gu, ' '.repeat(tabSize)).length;
	const indent = getIndent(text);
	let j = number,
		empty = true;
	for (; j < doc.lines; j++) {
		const {text: next} = doc.line(j + 1);
		if (next.trim()) {
			empty = false;
			const nextIndent = getIndent(next);
			if (indent >= nextIndent) {
				break;
			}
		}
	}
	return empty || j === number ? null : {from, to: doc.line(j).to};
});
