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
	findTemplateName,
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
import type {CodeMirror6} from './codemirror';
import type {CompletionSectionName, ApiSuggest} from './token';

declare const marked: {
	parse(source: string): string | Promise<string>;
};

const code = `${hoverSelector} code`;

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
					value: (description ? `<p>${escHTML(description)}</p>` : '') + (
						length === 0
							? ''
							: `<ul>${
								result.map(([keys,, info, section]) => `<li>${
									keys.map(key => `<code>${escHTML(key)}</code>`).join('/')
								}${info! && ' - '}${getDoc(section!, info)}</li>`).join('')
							}</ul>`
					),
				},
				range: {start: indexToPos(doc, node.from), end: indexToPos(doc, node.to)},
			};
		}
	} else if (node?.name.includes(tokens.templateArgumentName)) {
		const name = findTemplateName(state, node);
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
					// eslint-disable-next-line require-atomic-updates
					hover = await getHoverFromApi(state, pos, side, paramSuggest, templatedata);
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
