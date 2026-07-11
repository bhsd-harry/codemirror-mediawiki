import {hoverTooltip, EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {
	getLSP,
	escHTML,
} from '@bhsd/browser';
import {createTooltipView} from '@bhsd/cm-util/cm';
import {tokens} from './config.js';
import {baseData, hoverSelector, bgDark} from './constants.js';
import {
	indexToPos,
	posToIndex,
	toConfigGetter,
	sliceDoc,
	findTemplateName,
	loadMarked,
} from './util.js';
import type {Tooltip, TooltipView} from '@codemirror/view';
import type {
	Extension,
	EditorState,
} from '@codemirror/state';
import type {
	MarkupContent,
	Hover,
} from 'vscode-languageserver-types';
import type {Marked} from 'marked';
import type {CodeMirror6} from './codemirror';
import type {CompletionSectionName, ApiSuggest} from './token';

declare const marked: Marked;

const code = /* #__PURE__ */ (() => `${hoverSelector} code`)();

/**
 * @ignore
 * @test
 */
export const getDoc = (section: CompletionSectionName, info = ''): string => escHTML(info)
	+ (section === 'Optional' ? '' : `<br><b><i>@${section.toLowerCase()}</i></b>`);

/**
 * 从TemplateData API获取hover信息
 * @ignore
 * @test
 */
export const getHoverFromApi = async (
	state: EditorState,
	pos: number,
	side: 1 | -1,
	paramSuggest: ApiSuggest,
	templatedata?: boolean,
): Promise<Hover | undefined> => {
	const node = ensureSyntaxTree(state, pos + Math.max(side, 0))?.resolve(pos, side),
		{doc} = state;
	if (node?.name.includes(tokens.templateName)) {
		const result = await paramSuggest(sliceDoc(state, node), templatedata),
			{description, length} = result;
		if (description || length > 0) {
			return {
				contents: {
					kind: 'plaintext',
					value: (description ? `<p>${escHTML(description)}</p>` : '')
						+ (['Required', 'Suggested', 'Optional', 'Deprecated'] as const).map(name => {
							const sectionResult = result.filter(([,,, section]) => section === name);
							return sectionResult.length === 0
								? ''
								: `<h4>${name}</h4><ul>${
									sectionResult.map(([keys,, info]) => `<li>${
										keys.map(key => `<code>${escHTML(key)}</code>`).join('/')
									}${info && ` - ${escHTML(info)}`}</li>`).join('')
								}</ul>`;
						}).join(''),
				},
				range: {start: indexToPos(doc, node.from), end: indexToPos(doc, node.to)},
			};
		}
	} else if (node?.name.includes(tokens.templateArgumentName)) {
		const [name] = findTemplateName(state, node);
		if (name) {
			const result = await paramSuggest(name, templatedata),
				param = sliceDoc(state, node).trim().slice(0, -1).trim(),
				[,, info, section] = result.find(([keys]) => keys.includes(param)) ?? [];
			if (info || section && section !== 'Optional') {
				return {
					contents: {
						kind: 'plaintext',
						value: getDoc(section!, info).replace(/^<br>/u, ''),
					},
					range: {start: indexToPos(doc, node.from), end: indexToPos(doc, node.to)},
				};
			}
		}
	}
	return undefined;
};

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
	articlePath?: string,
	templatedata?: boolean,
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
				cm.lsp ??=
					getLSP(
						view,
						false,
						{
							getConfig: toConfigGetter(
								cm.getWikiConfig,
								articlePath,
							),
							cdn: baseData.CDN,
						},
					);
				const {lsp} = cm;
				let hover = await lsp?.provideHover(doc.toString(), indexToPos(doc, pos));
				if (!hover && paramSuggest && 'templatedata' in tags!) {
					// eslint-disable-next-line require-atomic-updates
					hover = await getHoverFromApi(state, pos, side, paramSuggest, templatedata);
				}
				if (hover) {
					await loadMarked();
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
								hoverSelector.slice(1),
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
