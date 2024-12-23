import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {trees, getTree, fromPositions} from 'monaco-wiki/src/tree';
import {getTag} from './matchTag';
import {tokens} from './config';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {EditorState} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {AST} from 'wikiparser-node';
import type * as Monaco from 'monaco-editor';
import type {editor} from 'monaco-editor';

declare type Ranges = [number, number][];
declare const monaco: typeof Monaco;

/**
 * 获取节点内容
 * @param state
 * @param node 语法树节点
 * @param node.from 起始位置
 * @param node.to 结束位置
 */
const getName = (state: EditorState, {from, to}: SyntaxNode): string => state.sliceDoc(from, to).trim();

const attributes = new Set(['follow', 'extends']);

/**
 * 查找注释的内容
 * @param view
 * @param tree 语法树
 * @param target 目标名称
 * @param all 是否查找所有
 * @param group 是否group属性
 */
const findRefImmediate = (
	view: EditorView | editor.ITextModel,
	tree: AST,
	target: string,
	all?: boolean,
	group?: boolean,
): Ranges => {
	const sliceDoc = (from: number, to: number): string => 'state' in view
		? view.state.sliceDoc(from, to)
		: view.getValueInRange(fromPositions(monaco, view, [from, to]));
	const {childNodes, type, name} = tree;
	if (!childNodes) {
		return [];
	} else if (type !== 'ext' || !(name === 'ref' || group && name === 'references')) {
		return childNodes.flatMap(child => findRefImmediate(view, child, target, all, group));
	}
	const {range} = childNodes[1]!;
	if (all || range[0] < range[1]) {
		const attrs = childNodes[0]!.childNodes!.filter(
				({type: t, name: n}) =>
					t === 'ext-attr' && (group ? n === 'group' : n === 'name' || all && attributes.has(n!)),
			),
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
};

/**
 * 异步查找注释的内容
 * @param view
 * @param target 目标名称
 * @param all 是否查找所有
 * @param group 是否group属性
 */
export const findRef = async (
	view: EditorView | editor.ITextModel,
	target: string,
	all?: boolean,
	group?: boolean,
): Promise<Ranges> => {
	if (!('wikiparse' in globalThis)) {
		return [];
	}
	const tree = getTree(view, 1);
	if (all && !target) { // 只用于CodeMirror autocompletion
		tree.docChanged = true;
	}
	return findRefImmediate(view, await tree, target, all, group);
};

export const refHover = [
	hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
		if (!('wikiparse' in globalThis)) {
			return null;
		}
		const {state} = view,
			node = ensureSyntaxTree(state, pos)?.resolve(pos, side);
		if (node && /-exttag-(?!bracket)/u.test(node.name)) {
			const tag = getTag(state, node);
			if (!tag) {
				return null;
			}
			const {name, selfClosing, first, last, to} = tag;
			if (name === 'ref' && selfClosing) {
				let prevSibling: SyntaxNode | null = last,
					nextSibling: SyntaxNode | null = null;
				while (prevSibling && prevSibling.from > first.to) {
					const key = getName(state, prevSibling);
					if (
						prevSibling.name.split('_').includes(tokens.extTagAttribute)
						&& /(?:^|\s)name(?:$|[\s=])/iu.test(key)
					) {
						if (/(?:^|\s)name\s*=/iu.test(key)) {
							({nextSibling} = prevSibling);
						}
						break;
					}
					({prevSibling} = prevSibling);
				}
				if (nextSibling?.name.includes(tokens.extTagAttributeValue)) {
					let target = getName(state, nextSibling);
					const quote = target.slice(0, 1);
					if (quote === '"' || quote === "'") {
						target = target.slice(1, target.slice(-1) === quote ? -1 : undefined).trim();
					}
					if (target) {
						const [ref] = await findRef(view, target);
						return {
							pos,
							end: to,
							above: true,
							create(): TooltipView {
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
						} satisfies Tooltip;
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
