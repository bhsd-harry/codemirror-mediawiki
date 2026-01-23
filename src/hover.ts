import {hoverTooltip, EditorView} from '@codemirror/view';
import {
	getLSP,
} from '@bhsd/browser';
import {marked} from 'marked';
import {base, hoverSelector, bgDark} from './constants.js';
import {
	indexToPos,
	posToIndex,
	createTooltipView,
	toConfigGetter,
	updateCDN,
} from './util.js';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {MarkupContent} from 'vscode-languageserver-types';
import type {ConfigData} from 'wikiparser-node';

const code = `${hoverSelector} code`;

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
				const hover = await getLSP(
					view,
					true,
					toConfigGetter(
						configData,
					),
					base.CDN,
				)?.provideHover(doc.toString(), indexToPos(doc, pos));
				if (hover) {
					const {end} = hover.range!;
					return {
						pos,
						end: posToIndex(doc, end),
						above: true,
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
