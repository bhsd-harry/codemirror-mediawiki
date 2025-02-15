import {hoverTooltip} from '@codemirror/view';
import {loadScript} from '@bhsd/common';
import type {Tooltip, TooltipView, EditorView} from '@codemirror/view';
import type {Text} from '@codemirror/state';
import type {LanguageServiceBase} from 'wikiparser-node/extensions/typings';
import type {MarkupContent, Position} from 'vscode-languageserver-types';
import type * as MarkdownIt from 'markdown-it';

declare const markdownit: () => MarkdownIt;

const lsps = new WeakMap<EditorView, LanguageServiceBase>();
let md: MarkdownIt | undefined;

/**
 * 获取当前编辑器的语言服务
 * @param view EditorView 实例
 */
export const getLSP = (view: EditorView): LanguageServiceBase | undefined => {
	void loadScript('npm/wikiparser-node/extensions/dist/base.min.js', 'wikiparse');
	void loadScript('npm/wikiparser-node/extensions/dist/lsp.min.js', 'wikiparse.LanguageService');
	if (!('wikiparse' in globalThis && wikiparse.LanguageService)) {
		return undefined;
	} else if (lsps.has(view)) {
		return lsps.get(view);
	}
	const lsp = new wikiparse.LanguageService();
	lsps.set(view, lsp);
	return lsp;
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

export default hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
	const {state: {doc}} = view,
		hover = await getLSP(view)
			?.provideHover(doc.toString(), indexToPos(doc, pos + Math.max(0, side)));
	if (hover) {
		await loadScript('npm/markdown-it/dist/markdown-it.min.js', 'markdownit', true);
		md ??= markdownit();
		const {end} = hover.range!;
		return {
			pos,
			end: doc.line(end.line + 1).from + end.character,
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
