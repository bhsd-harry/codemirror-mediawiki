import {hoverTooltip} from '@codemirror/view';
import {loadScript, getLSP} from '@bhsd/common';
import type {Tooltip, TooltipView, EditorView} from '@codemirror/view';
import type {Text, Extension} from '@codemirror/state';
import type {MarkupContent, Position} from 'vscode-languageserver-types';
import type * as MarkdownIt from 'markdown-it';
import type {CodeMirror6} from './codemirror';

declare const markdownit: () => MarkdownIt;

let md: MarkdownIt | undefined;

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
	const dom = document.createElement('div'),
		inner = document.createElement('div');
	dom.append(inner);
	dom.className = 'cm-tooltip-hover';
	dom.style.font = getComputedStyle(view.contentDOM).font;
	inner.innerHTML = innerHTML;
	return {dom};
};

export default (cm: CodeMirror6): Extension => hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
	const {state: {doc}} = view,
		hover = await getLSP(view, false, cm.getWikiConfig)
			?.provideHover(doc.toString(), indexToPos(doc, pos));
	if (hover) {
		await loadScript('npm/markdown-it/dist/markdown-it.min.js', 'markdownit', true);
		md ??= markdownit();
		const {end} = hover.range!;
		return {
			pos,
			end: posToIndex(doc, end),
			above: true,
			create(): TooltipView {
				return createTooltipView(view, md!.render((hover.contents as MarkupContent).value));
			},
		};
	}
	return null;
});
