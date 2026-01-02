import {hoverTooltip, EditorView} from '@codemirror/view';
import {loadScript, getLSP} from '@bhsd/browser';
import {base, hoverSelector} from './constants.js';
import {indexToPos, posToIndex, createTooltipView} from './util.js';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {MarkupContent} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror.js';

declare const marked: {
	parse(source: string): string;
};

export default (cm: CodeMirror6): Extension => [
	hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
		const {state} = view,
			{doc} = state;
		const hover = await getLSP(view, false, cm.getWikiConfig, base.CDN)
			?.provideHover(doc.toString(), indexToPos(doc, pos));
		if (hover) {
			const {CDN = ''} = base;
			await loadScript(
				`${CDN}${CDN && '/'}npm/marked/lib/marked.umd.js`,
				'marked',
				true,
			);
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
