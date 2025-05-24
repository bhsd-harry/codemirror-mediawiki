import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {getLSP} from '@bhsd/common';
import {getTag} from './matchTag';
import {tokens} from './config';
import {indexToPos, posToIndex} from './hover';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {EditorState, Extension} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {AST} from 'wikiparser-node';
import type {CodeMirror6} from './codemirror';

declare type Tree = Promise<AST> & {docChanged?: boolean};

const trees = new WeakMap<EditorView, Tree>();

/**
 * 获取节点内容
 * @param state
 * @param node 语法树节点
 * @param node.from 起始位置
 * @param node.to 结束位置
 */
const getName = (state: EditorState, {from, to}: SyntaxNode): string => state.sliceDoc(from, to).trim();

export default (cm: CodeMirror6): Extension => [
	hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
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
					const quote = target.charAt(0);
					if (quote === '"' || quote === "'") {
						target = target.slice(1, target.slice(-1) === quote ? -1 : undefined).trim();
					}
					if (target) {
						const {doc} = state,
							ref = await getLSP(view, false, cm.getWikiConfig)
								?.provideDefinition(doc.toString(), indexToPos(doc, first.to));
						return {
							pos,
							end: to,
							above: true,
							create(): TooltipView {
								const dom = document.createElement('div');
								dom.className = 'cm-tooltip-ref';
								dom.style.font = getComputedStyle(view.contentDOM).font;
								if (ref) {
									const {range: {start, end}} = ref[0]!,
										anchor = posToIndex(doc, start),
										head = posToIndex(doc, end);
									dom.textContent = state.sliceDoc(anchor, head);
									dom.addEventListener('click', () => {
										view.dispatch({
											selection: {anchor, head},
											scrollIntoView: true,
										});
									});
								} else {
									dom.textContent = state.phrase('No definition found');
								}
								return {dom};
							},
						};
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
] as Extension;
