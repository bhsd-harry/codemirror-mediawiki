import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree, language, highlightingFor} from '@codemirror/language';
import {highlightCode} from '@lezer/highlight';
import {getLSP, escHTML} from '@bhsd/browser';
import elt from 'crelt';
import {baseData} from './constants.js';
import {tokens} from './config.js';
import {getTag} from './matchTag.js';
import {
	sliceDoc,
	indexToPos,
	posToIndex,
	toConfigGetter,
	updateCDN,
} from './util.js';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {EditorState, Extension} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import type {
	AST,
	ConfigData,
} from 'wikiparser-node';
import type {WikiTag} from './matchTag';

declare type Tree = Promise<AST> & {docChanged?: boolean};

const trees = new WeakMap<EditorView, Tree>(),
	selector = '.cm-tooltip-ref',
	noDef = '.cm-tooltip-no-def';

/**
 * 获取节点内容
 * @param state
 * @param node 语法树节点
 */
const getRefName = (state: EditorState, node: SyntaxNode): string => sliceDoc(state, node).trim();

/**
 * 高亮<ref>内容
 * @param state 编辑器EditorState
 * @param text <ref>内容
 */
export const highlightRef = (state: EditorState, text: string): string => {
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
	return result;
};

/**
 * 判断是否需要显示悬停提示
 * @ignore
 */
export const needHover = (state: EditorState, {name, selfClosing, first, last}: WikiTag): boolean => {
	if (name === 'ref' && selfClosing) {
		let prevSibling: SyntaxNode | null = last,
			nextSibling: SyntaxNode | null = null;
		while (prevSibling && prevSibling.from > first.to) {
			const key = getRefName(state, prevSibling);
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
			let target = getRefName(state, nextSibling);
			const quote = target.charAt(0);
			if (quote === '"' || quote === "'") {
				target = target.slice(1, target.slice(-1) === quote ? -1 : undefined).trim();
			}
			if (target) {
				return true;
			}
		}
	}
	return false;
};

/**
 * Get the [refHover](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#refhover)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://fastly.jsdelivr.net`
 */
export default (
	configData: ConfigData,
	cdn?: string,
): Extension => {
	updateCDN(cdn);
	return [
		hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
			const {state} = view,
				node = ensureSyntaxTree(state, pos)?.resolve(pos, side);
			if (node?.name.includes('-exttag-')) {
				const tag = getTag(state, node);
				if (tag && needHover(state, tag)) {
					const {doc} = state,
						ref = await getLSP(
							view,
							true,
							{
								getConfig: toConfigGetter(
									configData,
								),
								cdn: baseData.CDN,
							},
						)?.provideDefinition(doc.toString(), indexToPos(doc, tag.first.to));
					return {
						pos,
						end: tag.to,
						above: true,
						create(): TooltipView {
							const dom = elt('div', {class: selector.slice(1)});
							dom.style.font = getComputedStyle(view.contentDOM).font;
							if (ref) {
								const {start, end} = ref[0]!.range,
									anchor = posToIndex(doc, start),
									head = posToIndex(doc, end);
								dom.innerHTML = highlightRef(state, state.sliceDoc(anchor, head));
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
};
