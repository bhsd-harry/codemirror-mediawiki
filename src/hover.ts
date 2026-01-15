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

/**
 * Get the [hover](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#hover)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://testingcf.jsdelivr.net`
 */
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
