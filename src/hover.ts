import {hoverTooltip} from '@codemirror/view';
import {loadScript} from '@bhsd/common';
import type {Tooltip, TooltipView, EditorView} from '@codemirror/view';
import type {LanguageServiceBase} from 'wikiparser-node/extensions/typings';
import type {MarkupContent} from 'vscode-languageserver-types';
import type * as MarkdownIt from 'markdown-it';

declare const markdownit: () => MarkdownIt;

const lsps = new WeakMap<EditorView, LanguageServiceBase>();
let md: MarkdownIt | undefined;

export default hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
	if (!('wikiparse' in globalThis && wikiparse.LanguageService)) {
		return null;
	}
	let lsp = lsps.get(view);
	if (!lsp) {
		lsp = new wikiparse.LanguageService();
		lsps.set(view, lsp);
	}
	const {state: {doc}} = view,
		line = doc.lineAt(pos),
		hover = await lsp.provideHover(view.state.doc.toString(), {line: line.number - 1, character: pos - line.from});
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
				dom.className = 'cm-tooltip-ref';
				dom.style.font = getComputedStyle(view.contentDOM).font;
				inner.innerHTML = md!.render((hover.contents as MarkupContent).value);
				return {dom};
			},
		} satisfies Tooltip;
	}
	return null;
});
