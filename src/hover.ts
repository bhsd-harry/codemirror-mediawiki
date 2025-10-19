import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {loadScript, getLSP} from '@bhsd/browser';
import elt from 'crelt';
import {tokens} from './config';
import {isWMF} from './mediawiki';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {Text, Extension} from '@codemirror/state';
import type {MarkupContent, Position} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror';

declare const marked: {
	parse(source: string): string;
};

/**
 * 将索引转换为位置
 * @param doc Text 实例
 * @param index 索引
 */
export const indexToPos = (doc: Text, index: number): Position => {
	const line = doc.lineAt(index);
	return {line: line.number - 1, character: index - line.from};
};

/**
 * 将位置转换为索引
 * @param doc Text 实例
 * @param pos 位置
 */
export const posToIndex = (doc: Text, pos: Position): number => {
	const line = doc.line(pos.line + 1);
	return Math.min(line.from + pos.character, line.to);
};

/**
 * 创建 TooltipView
 * @param view EditorView 实例
 * @param innerHTML 提示内容
 */
export const createTooltipView = (view: EditorView, innerHTML: string): TooltipView => {
	const inner = elt('div'),
		dom = elt('div', {class: 'cm-tooltip-hover'}, inner);
	dom.style.font = getComputedStyle(view.contentDOM).font;
	inner.innerHTML = innerHTML;
	return {dom};
};

export const selector = '.cm-tooltip-hover';

export default (cm: CodeMirror6): Extension => [
	hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
		const {state} = view,
			{doc} = state,
			{paramSuggest, tags} = cm.langConfig!;
		let hover = await getLSP(view, false, cm.getWikiConfig)
			?.provideHover(doc.toString(), indexToPos(doc, pos));
		if (isWMF && !hover && paramSuggest && 'templatedata' in tags) {
			const node = ensureSyntaxTree(state, pos + Math.max(side, 0))?.resolve(pos, side);
			if (node?.name.includes(tokens.templateName)) {
				const result = await paramSuggest(state.sliceDoc(node.from, node.to));
				if (result.length > 0) {
					// eslint-disable-next-line require-atomic-updates
					hover = {
						contents: result.map(([key, details]) => `\`${key}\`${details ? ` — ${details}` : ''}`)
							.join('\n\n'),
						range: {start: indexToPos(doc, node.from), end: indexToPos(doc, node.to)},
					};
				}
			}
		}
		if (hover) {
			await loadScript('npm/marked/lib/marked.umd.js', 'marked', true);
			const {end} = hover.range!;
			return {
				pos,
				end: posToIndex(doc, end),
				above: true,
				create(): TooltipView {
					const {contents} = hover;
					return createTooltipView(
						view,
						marked.parse(typeof contents === 'string' ? contents : (contents as MarkupContent).value),
					);
				},
			};
		}
		return null;
	}),
	EditorView.theme({
		[selector]: {
			padding: '2px 5px',
			width: 'max-content',
			maxWidth: '60vw',
			overflowY: 'auto',
		},
		[`${selector} *`]: {
			marginTop: '0!important',
			marginBottom: '0!important',
		},
		[`${selector}>div`]: {
			fontSize: '90%',
			lineHeight: 1.4,
		},
		[`${selector} code`]: {
			padding: '.1em .4em',
			borderRadius: '.4em',
		},
	}),
];
