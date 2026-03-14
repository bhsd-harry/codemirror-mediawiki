import {Decoration, EditorView, ViewPlugin} from '@codemirror/view';
import {bracketMatching, matchBrackets, syntaxTree} from '@codemirror/language';
import type {DecorationSet, PluginValue, ViewUpdate} from '@codemirror/view';
import type {Extension, Range, Facet, EditorState} from '@codemirror/state';
import type {Config, MatchResult} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';

export interface Selection {
	anchor: number;
	head: number;
}

export interface BracketConfig extends Config {
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	exclude?: (state: EditorState, pos: number) => boolean;
}

export type RequiredConfig = Required<Config> & BracketConfig;

/**
 * @ignore
 * @test
 */
export const findEnclosingBrackets = (node: SyntaxNode, pos: number, brackets: string): MatchResult | undefined => {
	let parent: SyntaxNode | null = node;
	while (parent) {
		const {firstChild, lastChild} = parent;
		if (firstChild && lastChild) {
			const i = brackets.indexOf(firstChild.name),
				j = brackets.indexOf(lastChild.name);
			if (i !== -1 && j !== -1 && i % 2 === 0 && j % 2 === 1 && firstChild.from < pos && lastChild.to > pos) {
				return {start: firstChild, end: lastChild, matched: true};
			}
		}
		({parent} = parent);
	}
	return undefined;
};

/**
 * @ignore
 * @test
 */
export const findEnclosingPlainBrackets = (
	state: EditorState,
	pos: number,
	config: Required<Config>,
): MatchResult | null => {
	const {brackets, maxScanDistance} = config,
		re = new RegExp(
			`[${
				[...brackets].filter((_, i) => i % 2).map(c => c === ']' ? String.raw`\]` : c).join('')
			}]`,
			'gu',
		),
		str = state.sliceDoc(pos, pos + maxScanDistance);
	let mt = re.exec(str);
	while (mt) {
		const result = matchBrackets(state, pos + mt.index + 1, -1, config),
			left = result?.end?.to;
		if (left !== undefined && left <= pos) {
			return result;
		}
		mt = re.exec(str);
	}
	return null;
};

/**
 * @ignore
 * @test
 */
export const trySelectMatchingBrackets = (
	state: EditorState,
	pos: number,
	dir: 1 | -1,
	config?: Config,
	inside = false,
): Selection | false => {
	if (pos < 0) {
		return false;
	}
	const match = matchBrackets(state, pos, dir, config) || false,
		rightInside = dir === 1 === inside;
	return match && match.matched && {
		anchor: match.start[rightInside ? 'to' : 'from'],
		head: match.end![rightInside ? 'from' : 'to'],
	};
};

/**
 * @ignore
 * @test
 */
export const selectMatchingBrackets = (
	state: EditorState,
	pos: number,
	config?: Config,
): Selection | false => trySelectMatchingBrackets(state, pos, -1, config)
	|| trySelectMatchingBrackets(state, pos, 1, config)
	|| trySelectMatchingBrackets(state, pos + 1, -1, config, true)
	|| trySelectMatchingBrackets(state, pos - 1, 1, config, true);

/**
 * @ignore
 * @test
 */
export const bracketDeco = (state: EditorState, config: RequiredConfig): DecorationSet => {
	const decorations: Range<Decoration>[] = [],
		{afterCursor, brackets, renderMatch, exclude} = config;
	for (const {empty, head} of state.selection.ranges) {
		if (!empty) {
			continue;
		}
		const tree = syntaxTree(state),
			excluded = exclude?.(state, head),
			match = !excluded && (
				matchBrackets(state, head, -1, config)
				|| head > 0 && matchBrackets(state, head - 1, 1, config)
				|| afterCursor && (
					matchBrackets(state, head, 1, config)
					|| head < state.doc.length && matchBrackets(state, head + 1, -1, config)
				)
			)
			|| findEnclosingBrackets(tree.resolveInner(head, -1), head, brackets)
			|| afterCursor && findEnclosingBrackets(tree.resolveInner(head, 1), head, brackets)
			|| !excluded && findEnclosingPlainBrackets(state, head, config);
		if (match) {
			decorations.push(...renderMatch(match, state));
		}
	}
	return Decoration.set(decorations, true);
};

export default (configs?: BracketConfig): Extension => {
	const extension = bracketMatching(configs) as [
			Extension & {facet: Facet<Config, RequiredConfig>},
			[ViewPlugin<PluginValue, undefined>, Extension],
		],
		[{facet}, plugins] = extension;
	plugins[0] = ViewPlugin.fromClass(
		class implements PluginValue {
			declare decorations;
			declare paused;

			constructor({state}: EditorView) {
				this.decorations = bracketDeco(state, state.facet(facet));
				this.paused = false;
			}

			update({docChanged, selectionSet, changes, state, view: {composing}}: ViewUpdate): void {
				if (docChanged || selectionSet || this.paused) {
					if (composing) {
						this.decorations = this.decorations.map(changes);
						this.paused = true;
					} else {
						this.decorations = bracketDeco(state, state.facet(facet));
						this.paused = false;
					}
				}
			}
		},
		{
			decorations({decorations}) {
				return decorations;
			},
		},
	);
	return [
		extension,
		EditorView.domEventHandlers({

			/**
			 * @ignore
			 * @todo 由于括号高亮的重绘，双击会被识别为两次单击，导致功能失效
			 */
			dblclick(e, view) {
				const pos = view.posAtCoords(e),
					{state} = view,
					config = state.facet(facet);
				if (pos === null || config.exclude?.(state, pos)) {
					return false;
				}
				const selection = selectMatchingBrackets(state, pos, config);
				if (selection) {
					view.dispatch({selection});
					return true;
				}
				return false;
			},
		}),
	];
};
