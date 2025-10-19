import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {loadScript, getLSP} from '@bhsd/browser';
import {tokens} from './config';
import {hoverSelector} from './constants';
import {escHTML, indexToPos, posToIndex, createTooltipView} from './util';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {MarkupContent} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror';

declare const marked: {
	parse(source: string): string;
};

export default (cm: CodeMirror6): Extension => [
	hoverTooltip(async (view, pos, side): Promise<Tooltip | null> => {
		const {state} = view,
			{doc} = state,
			{paramSuggest, tags} = cm.langConfig!;
		let hover = await getLSP(view, false, cm.getWikiConfig)
			?.provideHover(doc.toString(), indexToPos(doc, pos));
		if (!hover && paramSuggest && 'templatedata' in tags) {
			const node = ensureSyntaxTree(state, pos + Math.max(side, 0))?.resolve(pos, side);
			if (node?.name.includes(tokens.templateName)) {
				const result = await paramSuggest(state.sliceDoc(node.from, node.to), false),
					{description, length} = result;
				if (description || length > 0) {
					// eslint-disable-next-line require-atomic-updates
					hover = {
						contents: {
							kind: 'plaintext',
							value: (description ? `<p>${escHTML(description)}</p>` : '') + (
								length === 0
									? ''
									: `<ul>${
										result.map(([key, details]) => `<li><code>${escHTML(key)}</code>${
											details ? ` — ${escHTML(details)}` : ''
										}</li>`).join('')
									}</ul>`
							),
						},
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
					const {kind, value} = hover.contents as MarkupContent;
					return createTooltipView(view, kind === 'plaintext' ? value : marked.parse(value));
				},
			};
		}
		return null;
	}),
	EditorView.theme({
		[hoverSelector]: {
			padding: '2px 5px',
			width: 'max-content',
			maxWidth: '60vw',
			overflowY: 'auto',
		},
		[`${hoverSelector} *`]: {
			marginTop: '0!important',
			marginBottom: '0!important',
		},
		[`${hoverSelector}>div`]: {
			fontSize: '90%',
			lineHeight: 1.4,
		},
		[`${hoverSelector} code`]: {
			padding: '.1em .4em',
			borderRadius: '.4em',
		},
	}),
];
