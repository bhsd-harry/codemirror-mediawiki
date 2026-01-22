import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {
	getLSP,
	loadScript,
} from '@bhsd/browser';
import {tokens} from './config.js';
import {base, hoverSelector, bgDark} from './constants.js';
import {
	indexToPos,
	posToIndex,
	createTooltipView,
	toConfigGetter,
	escHTML,
	sliceDoc,
} from './util.js';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {MarkupContent} from 'vscode-languageserver-types';
import type {CodeMirror6} from './codemirror.js';

declare const marked: {
	parse(source: string): string | Promise<string>;
};

const code = `${hoverSelector} code`;

export default (
	articlePath?: string,
) => (
	cm: CodeMirror6,
): Extension => {
	return [
		hoverTooltip(
			async (
				view,
				pos,
				side,
			): Promise<Tooltip | null> => {
				const {state} = view,
					{doc} = state;
				const {paramSuggest, tags} = cm.langConfig!;
				let hover = await getLSP(
					view,
					false,
					toConfigGetter(
						cm.getWikiConfig,
						articlePath,
					),
					base.CDN,
				)?.provideHover(doc.toString(), indexToPos(doc, pos));
				if (!hover && paramSuggest && 'templatedata' in tags) {
					const node = ensureSyntaxTree(state, pos + Math.max(side, 0))?.resolve(pos, side);
					if (node?.name.includes(tokens.templateName)) {
						const result = await paramSuggest(sliceDoc(state, node), false),
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
