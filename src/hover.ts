import {hoverTooltip} from '@codemirror/view';
import {loadScript, getLSP} from '@bhsd/common';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {Text} from '@codemirror/state';
import type {MarkupContent, Position} from 'vscode-languageserver-types';
import type * as MarkdownIt from 'markdown-it';

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
export const posToIndex = (doc: Text, pos: Position): number => doc.line(pos.line + 1).from + pos.character;

export default hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
	const {state: {doc}} = view,
		hover = await getLSP(view)
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
				const dom = document.createElement('div'),
					inner = document.createElement('div');
				dom.append(inner);
				dom.className = 'cm-tooltip-hover';
				dom.style.font = getComputedStyle(view.contentDOM).font;
				inner.innerHTML = md!.render((hover.contents as MarkupContent).value);
				return {dom};
			},
		};
	}
	return null;
});
