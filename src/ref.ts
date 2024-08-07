import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {getTag} from './matchTag';
import {tokens} from './config';
import type {Tooltip} from '@codemirror/view';
import type {EditorState} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {AST} from 'wikiparser-node/base';
import type * as Monaco from 'monaco-editor';
import type {editor} from 'monaco-editor';

declare type ExtToken = AST & {
	name?: string;
	selfClosing?: boolean;
};
declare type Ranges = [number, number][];
declare type Tree = Promise<AST> & {docChanged?: boolean};
declare const monaco: typeof Monaco;

export const trees = new WeakMap<EditorView | editor.ITextModel, Tree>();

/**
 * 获取节点内容
 * @param state
 * @param node 语法树节点
 * @param node.from 起始位置
 * @param node.to 结束位置
 */
const getName = (state: EditorState, {from, to}: SyntaxNode): string => state.sliceDoc(from, to).trim();

/**
 * 查找注释的内容
 * @param view
 * @param tree 语法树
 * @param target 目标名称
 * @param all 是否查找所有
 */
const findRefImmediate = (
	view: EditorView | editor.ITextModel,
	tree: ExtToken,
	target: string,
	all: boolean,
): Ranges => {
	const sliceDoc = (from: number, to: number): string => 'state' in view
		? view.state.sliceDoc(from, to)
		: view.getValueInRange(monaco.Range.fromPositions(view.getPositionAt(from), view.getPositionAt(to)));
	const {childNodes, type, name, selfClosing} = tree,
		refs: Ranges = [];
	if (!childNodes) {
		return [];
	} else if (type === 'ext' && name === 'ref') {
		if (all || !selfClosing) {
			const attrs = childNodes[0]!.childNodes!.filter(({type: t, name: n}) => t === 'ext-attr' && n === 'name'),
				attr = attrs[attrs.length - 1]?.childNodes![1];
			if (!attr) {
				// pass
			} else if (all && !target) {
				return [attr.range];
			} else if (sliceDoc(...attr.range).trim() === target) {
				return [(all ? tree : childNodes[1]!).range];
			}
		}
		return [];
	}
	for (const child of childNodes) {
		const ref = findRefImmediate(view, child, target, all);
		if (all) {
			refs.push(...ref);
		} else if (ref.length > 0) {
			return ref;
		}
	}
	return refs;
};

/**
 * 异步查找注释的内容
 * @param view
 * @param target 目标名称
 * @param all 是否查找所有
 */
export const findRef = async (view: EditorView | editor.ITextModel, target: string, all = false): Promise<Ranges> => {
	let tree = trees.get(view);
	if (!tree || tree.docChanged) {
		tree = wikiparse.json('state' in view ? view.state.doc.toString() : view.getValue(), true, -5, 1) as Tree;
		trees.set(view, tree);
		if (all && !target) {
			tree.docChanged = true;
		}
	}
	return findRefImmediate(view, await tree, target, all);
};

export const refHover = [
	hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
		if (!('wikiparse' in window)) {
			return null;
		}
		const {state} = view,
			node = ensureSyntaxTree(state, pos)?.resolve(pos, side);
		if (node && /-exttag-(?!bracket)/u.test(node.name)) {
			const {name, selfClosing, first: {to}, last, to: end} = getTag(state, node);
			if (name === 'ref' && (selfClosing || !last.name.includes(tokens.extTagBracket))) {
				let prevSibling: SyntaxNode | null = last,
					nextSibling: SyntaxNode | null = null;
				while (prevSibling && prevSibling.from > to) {
					if (
						prevSibling.name.split('_').includes(tokens.extTagAttribute)
						&& getName(state, prevSibling).toLowerCase() === 'name'
					) {
						({nextSibling} = prevSibling);
						break;
					}
					({prevSibling} = prevSibling);
				}
				if (nextSibling && getName(state, nextSibling) === '=') {
					({nextSibling} = nextSibling);
					const quote = nextSibling && getName(state, nextSibling);
					if (quote === '"' || quote === "'") {
						({nextSibling} = nextSibling!);
					}
					const target = nextSibling?.name.includes(tokens.extTagAttributeValue)
						&& getName(state, nextSibling);
					if (target) {
						const [ref] = await findRef(view, target);
						return {
							pos,
							end,
							above: true,
							create() {
								const dom = document.createElement('div');
								dom.className = 'cm-tooltip-ref';
								dom.style.font = getComputedStyle(view.contentDOM).font;
								if (ref) {
									dom.textContent = state.sliceDoc(...ref);
									dom.addEventListener('click', () => {
										view.dispatch({
											selection: {anchor: ref[0], head: ref[1]},
											scrollIntoView: true,
										});
									});
								} else {
									dom.textContent = state.phrase('No definition found') + target;
								}
								return {dom};
							},
						} as Tooltip;
					}
				}
			}
		}
		return null;
	}),
	EditorView.updateListener.of(({view, docChanged}) => {
		if (docChanged) {
			const tree = trees.get(view);
			if (tree) {
				tree.docChanged = true;
			}
		}
	}),
];
