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
}

export type RequiredConfig = Required<Config> & BracketConfig;

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

export const selectMatchingBrackets = (
	state: EditorState,
	pos: number,
	config?: Config,
): Selection | false => trySelectMatchingBrackets(state, pos, -1, config)
	|| trySelectMatchingBrackets(state, pos, 1, config)
	|| trySelectMatchingBrackets(state, pos + 1, -1, config, true)
	|| trySelectMatchingBrackets(state, pos - 1, 1, config, true);

const tryMatchBracetks = (
	state: EditorState,
	pos: number,
	config: Config & {afterCursor: boolean},
): MatchResult | false | null =>
	matchBrackets(state, pos, -1, config)
	|| pos > 0 && matchBrackets(state, pos - 1, 1, config)
	|| config.afterCursor && (
		matchBrackets(state, pos, 1, config)
		|| pos < state.doc.length && matchBrackets(state, pos + 1, -1, config)
	);

export const selectLineBlock = (state: EditorState, pos: number, config?: Config): Selection | false => {
	const {doc} = state,
		matching = tryMatchBracetks(state, pos, {...config, afterCursor: true});
	if (!matching || !matching.matched) {
		return false;
	}
	const {start, end} = matching,
		a = doc.lineAt(start.from),
		b = doc.lineAt(end!.from),
		dir = a.from < b.from;
	return {
		anchor: (dir ? a : b).from,
		head: Math.min(doc.length, (dir ? b : a).to + 1),
	};
};

export const bracketDeco = (state: EditorState, config: RequiredConfig): DecorationSet => {
	const decorations: Range<Decoration>[] = [],
		{
			afterCursor,
			brackets,
			renderMatch,
		} = config;
	for (const {empty, head} of state.selection.ranges) {
		if (!empty) {
			continue;
		}
		const tree = syntaxTree(state),
			match =
				tryMatchBracetks(state, head, config)
				|| findEnclosingBrackets(tree.resolveInner(head, -1), head, brackets)
				|| afterCursor && findEnclosingBrackets(tree.resolveInner(head, 1), head, brackets)
				|| // eslint-disable-line @stylistic/operator-linebreak
				findEnclosingPlainBrackets(state, head, config);
		if (match) {
			decorations.push(...renderMatch(match, state));
		}
	}
	return Decoration.set(decorations, true);
};

const clickHandler = (
	e: MouseEvent,
	view: EditorView,
	facet: Facet<Config, RequiredConfig>,
	select: (state: EditorState, pos: number, config?: Config) => Selection | false,
): boolean => {
	const pos = view.posAtCoords(e),
		{state} = view,
		config = state.facet(facet);
	if (
		pos === null
	) {
		return false;
	}
	const selection = select(state, pos, config);
	if (selection) {
		view.dispatch({selection});
		return true;
	}
	return false;
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
			/** @ignore */
			click(e, view) {
				return e.detail === 3 && clickHandler(e, view, facet, selectLineBlock);
			},

			/**
			 * @ignore
			 * @todo 由于括号高亮的重绘，双击会被识别为两次单击，导致功能失效
			 */
			dblclick(e, view) {
				return clickHandler(e, view, facet, selectMatchingBrackets);
			},
		}),
	];
};
