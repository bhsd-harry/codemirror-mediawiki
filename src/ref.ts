import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree, language, highlightingFor} from '@codemirror/language';
import {highlightCode} from '@lezer/highlight';
import {getLSP} from '@bhsd/browser';
import elt from 'crelt';
import {base} from './constants.js';
import {tokens} from './config.js';
import {getTag} from './matchTag.js';
import {
	sliceDoc,
	indexToPos,
	posToIndex,
	escHTML,
} from './util.js';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {EditorState, Extension} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {
	AST,
} from 'wikiparser-node';
import type {CodeMirror6} from './codemirror';

declare type Tree = Promise<AST> & {docChanged?: boolean};

const trees = new WeakMap<EditorView, Tree>(),
	selector = '.cm-tooltip-ref',
	noDef = '.cm-tooltip-no-def';

/**
 * 获取节点内容
 * @param state
 * @param node 语法树节点
 */
const getName = (state: EditorState, node: SyntaxNode): string => sliceDoc(state, node).trim();

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
							ref = await getLSP(view, false, cm.getWikiConfig, base.CDN)
								?.provideDefinition(doc.toString(), indexToPos(doc, first.to));
						return {
							pos,
							end: to,
							above: true,
							create(): TooltipView {
								const dom = elt('div', {class: selector.slice(1)});
								dom.style.font = getComputedStyle(view.contentDOM).font;
								if (ref) {
									const {range: {start, end}} = ref[0]!,
										anchor = posToIndex(doc, start),
										head = posToIndex(doc, end),
										text = state.sliceDoc(anchor, head);
									let result = '';
									highlightCode(
										text,
										state.facet(language)!.parser.parse(text),
										{
											style(tags) {
												return highlightingFor(state, tags);
											},
										},
										(code, classes) => {
											const escaped = escHTML(code);
											result += classes
												? `<span class="${classes}">${escaped}</span>`
												: escaped;
										},
										() => {
											result += '<br>';
										},
									);
									dom.innerHTML = result;
									dom.addEventListener('click', () => {
										view.dispatch({
											selection: {anchor, head},
											scrollIntoView: true,
										});
										view.focus();
									});
								} else {
									dom.textContent = state.phrase('No definition found');
									dom.classList.add(noDef.slice(1));
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
	EditorView.theme({
		[selector]: {
			padding: '2px 5px',
			width: 'max-content',
			maxWidth: '60vw',
			cursor: 'pointer',
			whiteSpace: 'pre-wrap',
		},
		[noDef]: {
			color: 'var(--cm-comment)',
		},
	}),
];
