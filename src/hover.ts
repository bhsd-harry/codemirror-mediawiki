import {hoverTooltip, EditorView} from '@codemirror/view';
import {getLSP} from '@bhsd/browser';
import {marked} from 'marked';
import {baseData, hoverSelector, bgDark} from './constants.js';
import {
	indexToPos,
	posToIndex,
	createTooltipView,
	toConfigGetter,
	updateCDN,
} from './util.js';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {
	Extension,
} from '@codemirror/state';
import type {
	MarkupContent,
} from 'vscode-languageserver-types';
import type {ConfigData} from 'wikiparser-node';

const code = /* #__PURE__ */ (() => `${hoverSelector} code`)();

/** hover tooltip and signature tooltip */
export const hoverStyle = /* #__PURE__ */ EditorView.theme({
	'.cm-tooltip-hover': {
		maxHeight: '60vh',
		overflow: 'hidden auto',
	},
	[hoverSelector]: {
		padding: '2px 5px',
		width: 'max-content',
		maxWidth: '60vw',
		'& *': {
			marginTop: '0!important',
			marginBottom: '0!important',
		},
		'&>div': {
			fontSize: '90%',
			lineHeight: 1.4,
		},
	},
});

export default (
	configData: ConfigData,
	cdn?: string,
): Extension => {
	updateCDN(cdn);
	return [
		hoverTooltip(
			async (
				view,
				pos,
			): Promise<Tooltip | null> => {
				const {state} = view,
					{doc} = state;
				const lsp = getLSP(
					view,
					true,
					toConfigGetter(
						configData,
					),
					baseData.CDN,
				);
				// eslint-disable-next-line prefer-const
				let hover = await lsp?.provideHover(doc.toString(), indexToPos(doc, pos));
				if (hover) {
					const {end} = hover.range!;
					return {
						pos,
						end: posToIndex(doc, end),
						create(): TooltipView {
							const {kind, value} = hover.contents as MarkupContent;
							return createTooltipView(
								view,
								kind === 'plaintext' ? value : marked.parse(value) as string,
							);
						},
					};
				}
				return null;
			},
		),
		hoverStyle,
		EditorView.theme({
			[code]: {
				color: 'inherit',
				padding: '.1em .4em',
				borderRadius: '.4em',
			},
		}),
		EditorView.baseTheme({
			[`&light ${code}`]: {
				backgroundColor: '#e0e6eb',
			},
			[`&dark ${code}`]: {
				backgroundColor: bgDark,
			},
		}),
	];
};
