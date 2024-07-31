import {showTooltip, keymap, GutterMarker, gutter, ViewPlugin} from '@codemirror/view';
import {StateField, RangeSetBuilder, RangeSet} from '@codemirror/state';
import {
	syntaxTree,
	ensureSyntaxTree,
	foldEffect,
	unfoldEffect,
	foldedRanges,
	unfoldAll,
	codeFolding,
	foldService,
	foldGutter,
	foldKeymap,
	foldState,
	language,
} from '@codemirror/language';
import modeConfig from './config';
import {matchTag} from './matchTag';
import type {EditorView, Tooltip, ViewUpdate, BlockInfo, PluginValue} from '@codemirror/view';
import type {EditorState, StateEffect, Extension} from '@codemirror/state';
import type {SyntaxNode, Tree} from '@lezer/common';
import type {TagName} from './token';

export interface DocRange {
	from: number;
	to: number;
}

declare type AnchorUpdate = (pos: number, range: DocRange) => number;

const updateSelection: AnchorUpdate = (pos, {to}): number => Math.max(pos, to),
	updateAll: AnchorUpdate = (pos, {from, to}) => from <= pos && to > pos ? to : pos;

const {tokens} = modeConfig;

/**
 * Check if a SyntaxNode includes the specified text
 * @param state
 * @param node 语法树节点
 * @param text 文本
 */
const includes = (state: EditorState, node: SyntaxNode, text: string): boolean =>
		state.sliceDoc(node.from, node.to).includes(text),

	/**
	 * Check if a SyntaxNode is among the specified components
	 * @param keys The keys of the tokens to check
	 */
	isComponent = (keys: TagName[]) =>
		({name}: SyntaxNode): boolean => keys.some(key => name.includes(tokens[key])),

	/** Check if a SyntaxNode is a template bracket (`{{` or `}}`) */
	isTemplateBracket = isComponent(['templateBracket', 'parserFunctionBracket']),

	/** Check if a SyntaxNode is a template delimiter (`|` or `:`) */
	isDelimiter = isComponent(['templateDelimiter', 'parserFunctionDelimiter']),

	/**
	 * Check if a SyntaxNode is part of a template, except for the brackets
	 * @param node 语法树节点
	 */
	isTemplate = (node: SyntaxNode): boolean =>
		/-(?:template|ext)[a-z\d-]+ground/u.test(node.name) && !isTemplateBracket(node),

	/** Check if a SyntaxNode is an extension tag bracket (`<` or `>`) */
	isExtBracket = isComponent(['extTagBracket']),

	/**
	 * Check if a SyntaxNode is part of a extension tag
	 * @param node 语法树节点
	 */
	isExt = (node: SyntaxNode): boolean => node.name.includes('mw-tag-'),

	/**
	 * Update the stack of opening (+) or closing (-) brackets
	 * @param state
	 * @param node 语法树节点
	 */
	stackUpdate = (state: EditorState, node: SyntaxNode): 1 | -1 => includes(state, node, '{') ? 1 : -1;

/**
 * 寻找可折叠的范围
 * @param state
 * @param posOrNode 字符位置或语法树节点
 * @param tree 语法树
 */
const foldable = (state: EditorState, posOrNode: number | SyntaxNode, tree?: Tree | null): DocRange | false => {
	if (typeof posOrNode === 'number') {
		tree = ensureSyntaxTree(state, posOrNode); // eslint-disable-line no-param-reassign
	}
	if (!tree) {
		return false;
	}
	let node: SyntaxNode;
	if (typeof posOrNode === 'number') {
		// Find the initial template node on both sides of the position
		node = tree.resolve(posOrNode, -1);
		if (!isTemplate(node) && !isExt(node)) {
			node = tree.resolve(posOrNode, 1);
		}
	} else {
		node = posOrNode;
	}
	if (!isTemplate(node)) {
		// Not a template
		if (isExt(node)) {
			let {nextSibling} = node;
			while (nextSibling && !(isExtBracket(nextSibling) && includes(state, nextSibling, '</'))) {
				({nextSibling} = nextSibling);
			}
			if (nextSibling) { // The closing bracket of the current extension tag
				return {from: matchTag(state, nextSibling.to)!.end!.to, to: nextSibling.from};
			}
		}
		return false;
	}
	let {prevSibling, nextSibling} = node,
		/** The stack of opening (+) or closing (-) brackets */ stack = 1,
		/** The first delimiter */ delimiter: SyntaxNode | null = isDelimiter(node) ? node : null;
	while (nextSibling) {
		if (isTemplateBracket(nextSibling)) {
			stack += stackUpdate(state, nextSibling);
			if (stack === 0) {
				// The closing bracket of the current template
				break;
			}
		} else if (!delimiter && stack === 1 && isDelimiter(nextSibling)) {
			// The first delimiter of the current template so far
			delimiter = nextSibling;
		}
		({nextSibling} = nextSibling);
	}
	if (!nextSibling) {
		// The closing bracket of the current template is missing
		return false;
	}
	stack = -1;
	while (prevSibling) {
		if (isTemplateBracket(prevSibling)) {
			stack += stackUpdate(state, prevSibling);
			if (stack === 0) {
				// The opening bracket of the current template
				break;
			}
		} else if (stack === -1 && isDelimiter(prevSibling)) {
			// The first delimiter of the current template so far
			delimiter = prevSibling;
		}
		({prevSibling} = prevSibling);
	}
	const /** The end of the first delimiter */ from = delimiter?.to,
		/** The start of the closing bracket */ to = nextSibling.from;
	return from && from < to ? {from, to} : false;
};

/**
 * 创建折叠提示
 * @param state
 */
const create = (state: EditorState): Tooltip | null => {
	const {selection: {main: {head}}} = state,
		range = foldable(state, head);
	if (range) {
		const {from, to} = range;
		let folded = false;
		foldedRanges(state).between(from, to, (i, j) => {
			if (i === from && j === to) {
				folded = true;
			}
		});
		return folded // eslint-disable-line @typescript-eslint/no-unnecessary-condition
			? null
			: {
				pos: head,
				above: true,
				create: (): {dom: HTMLElement} => {
					const dom = document.createElement('div');
					dom.className = 'cm-tooltip-fold';
					dom.textContent = '\uff0d';
					dom.title = state.phrase('Fold template or extension tag');
					dom.dataset['from'] = String(from);
					dom.dataset['to'] = String(to);
					return {dom};
				},
			};
	}
	return null;
};

/**
 * 执行折叠
 * @param view
 * @param effects 折叠
 * @param anchor 光标位置
 */
const execute = (view: EditorView, effects: StateEffect<DocRange>[], anchor: number): boolean => {
	if (effects.length > 0) {
		view.dom.querySelector('.cm-tooltip-fold')?.remove();
		// Fold the template(s) and update the cursor position
		view.dispatch({effects, selection: {anchor}});
		return true;
	}
	return false;
};

/**
 * The rightmost position of all selections, to be updated with folding
 * @param state
 */
const getAnchor = (state: EditorState): number => Math.max(...state.selection.ranges.map(({to}) => to));

/**
 * 折叠所有模板
 * @param state
 * @param tree 语法树
 * @param effects 折叠
 * @param node 语法树节点
 * @param end 终止位置
 * @param anchor 光标位置
 * @param update 更新光标位置
 */
const traverse = (
	state: EditorState,
	tree: Tree,
	effects: StateEffect<DocRange>[],
	node: SyntaxNode | null,
	end: number,
	anchor: number,
	update: AnchorUpdate,
): number => {
	while (node && node.from <= end) {
		/* eslint-disable no-param-reassign */
		const range = foldable(state, node, tree);
		if (range) {
			effects.push(foldEffect.of(range));
			node = tree.resolve(range.to, 1);
			// Update the anchor with the end of the last folded range
			anchor = update(anchor, range);
			continue;
		}
		node = node.nextSibling;
		/* eslint-enable no-param-reassign */
	}
	return anchor;
};

class FoldMarker extends GutterMarker {
	declare readonly open;

	constructor(open: boolean) {
		super();
		this.open = open;
	}

	override eq(other: this): boolean {
		return this.open === other.open;
	}

	override toDOM({state}: EditorView): HTMLSpanElement {
		const span = document.createElement('span');
		span.textContent = this.open ? '⌄' : '›';
		span.title = state.phrase(this.open ? 'Fold line' : 'Unfold line');
		return span;
	}
}

const canFold = new FoldMarker(true),
	canUnfold = new FoldMarker(false);

const findFold = ({state}: EditorView, line: BlockInfo): DocRange | undefined => {
	let found: DocRange | undefined;
	state.field(foldState, false)?.between(line.from, line.to, (from, to) => {
		if (!found && to === line.to) {
			found = {from, to};
		}
	});
	return found;
};

const foldableLine = (
	{state, viewport: {to: end}, viewportLineBlocks}: EditorView,
	{from: f, to: t}: BlockInfo,
): DocRange | false => {
	const tree = syntaxTree(state);

	/**
	 * 获取标题层级
	 * @param pos 行首位置
	 */
	const getLevel = (pos: number): number => {
			const {name} = tree.resolve(pos, 1);
			return name.includes(tokens.sectionHeader) ? Number(/mw-section--(\d)/u.exec(name)![1]) : 7;
		},

		/**
		 * 获取表格语法
		 * @param from 行首位置
		 * @param to 行尾位置
		 */
		getTable = (from: number, to: number): 0 | 1 | -1 => {
			const line = state.sliceDoc(from, to),
				bracket = /^\s*(?:(?::+\s*)?\{\||\|\})/u.exec(line)?.[0];
			if (bracket) {
				const {name} = tree.resolve(from + bracket.length, -1);
				if (name.includes(tokens.tableBracket)) {
					return bracket.endsWith('|}') ? -1 : 1;
				}
			}
			return 0;
		};

	const level = getLevel(f);
	if (level < 7) {
		for (const {from} of viewportLineBlocks) {
			if (from > f && getLevel(from) <= level) {
				return {from: t, to: from - 1};
			}
		}
		return end === state.doc.length && end > t && {from: t, to: end};
	} else if (getTable(f, t) === 1) {
		for (const {from, to} of viewportLineBlocks) {
			if (from > f) {
				const bracket = getTable(from, to);
				if (bracket === -1) {
					return {from: t, to};
				} else if (bracket === 1 || getLevel(from) < 7) {
					break;
				}
			}
		}
	}
	return false;
};

const buildMarkers = (view: EditorView): RangeSet<FoldMarker> => {
	const builder = new RangeSetBuilder<FoldMarker>();
	for (const line of view.viewportLineBlocks) {
		let mark: FoldMarker | undefined;
		if (findFold(view, line)) {
			mark = canUnfold;
		} else if (foldableLine(view, line)) {
			mark = canFold;
		}
		if (mark) {
			builder.add(line.from, line.from, mark);
		}
	}
	return builder.finish();
};

const markers = ViewPlugin.fromClass(class implements PluginValue {
	declare markers;

	constructor(view: EditorView) {
		this.markers = buildMarkers(view);
	}

	update({docChanged, viewportChanged, startState, state, view}: ViewUpdate): void {
		if (
			docChanged
			|| viewportChanged
			|| startState.facet(language) !== state.facet(language)
			|| startState.field(foldState, false) !== state.field(foldState, false)
			|| syntaxTree(startState) !== syntaxTree(state)
		) {
			this.markers = buildMarkers(view);
		}
	}
});

export const foldExtension: Extension = [
	codeFolding({
		placeholderDOM(view) {
			const element = document.createElement('span');
			element.textContent = '…';
			element.setAttribute('aria-label', 'folded code');
			element.title = view.state.phrase('unfold');
			element.className = 'cm-foldPlaceholder';
			element.addEventListener('click', ({target}) => {
				const pos = view.posAtDOM(target as Node),
					{state} = view,
					{selection} = state;
				foldedRanges(state).between(pos, pos, (from, to) => {
					if (from === pos) {
						// Unfold the template and redraw the selections
						view.dispatch({effects: unfoldEffect.of({from, to}), selection});
					}
				});
			});
			return element;
		},
	}),
	/** @see https://codemirror.net/examples/tooltip/ */
	StateField.define<Tooltip | null>({
		create,
		update(tooltip, {state, docChanged, selection}) {
			if (docChanged) {
				return null;
			}
			return selection ? create(state) : tooltip;
		},
		provide(f) {
			return showTooltip.from(f);
		},
	}),
	keymap.of([
		{
			// Fold the template at the selection/cursor
			key: 'Ctrl-Shift-[',
			mac: 'Cmd-Alt-[',
			run(view): boolean {
				const {state} = view,
					tree = syntaxTree(state),
					effects: StateEffect<DocRange>[] = [];
				let anchor = getAnchor(state);
				for (const {from, to, empty} of state.selection.ranges) {
					let node: SyntaxNode | null | undefined;
					if (empty) {
						// No selection, try both sides of the cursor position
						node = tree.resolve(from, -1);
					}
					if (!node || node.name === 'Document') {
						node = tree.resolve(from, 1);
					}
					anchor = traverse(state, tree, effects, node, to, anchor, updateSelection);
				}
				return execute(view, effects, anchor);
			},
		},
		{
			// Fold all templates in the document
			key: 'Ctrl-Alt-[',
			run(view): boolean {
				const {state} = view,
					tree = syntaxTree(state),
					effects: StateEffect<DocRange>[] = [],
					anchor = traverse(
						state,
						tree,
						effects,
						tree.topNode.firstChild,
						Infinity,
						getAnchor(state),
						updateAll,
					);
				return execute(view, effects, anchor);
			},
		},
		{
			// Unfold the template at the selection/cursor
			key: 'Ctrl-Shift-]',
			mac: 'Cmd-Alt-]',
			run(view): boolean {
				const {state} = view,
					{selection} = state,
					effects: StateEffect<DocRange>[] = [],
					folded = foldedRanges(state);
				for (const {from, to} of selection.ranges) {
					// Unfold any folded range at the selection
					folded.between(from, to, (i, j) => {
						effects.push(unfoldEffect.of({from: i, to: j}));
					});
				}
				if (effects.length > 0) {
					// Unfold the template(s) and redraw the selections
					view.dispatch({effects, selection});
					return true;
				}
				return false;
			},
		},
		{key: 'Ctrl-Alt-]', run: unfoldAll},
	]),
	markers,
	gutter({
		class: 'cm-foldGutter',
		markers(view) {
			return view.plugin(markers)?.markers || RangeSet.empty;
		},
		initialSpacer() {
			return new FoldMarker(false);
		},
		domEventHandlers: {
			click(view, line) {
				const folded = findFold(view, line);
				if (folded) {
					view.dispatch({effects: unfoldEffect.of(folded)});
					return true;
				}
				const range = foldableLine(view, line);
				if (range) {
					view.dispatch({effects: foldEffect.of(range)});
					return true;
				}
				return false;
			},
		},
	}),
];

/**
 * 点击提示折叠模板参数
 * @param view
 */
export const foldHandler = (view: EditorView) => (e: MouseEvent): void => {
	const dom = (e.target as Element).closest<HTMLElement>('.cm-tooltip-fold');
	if (dom) {
		e.preventDefault();
		const {dataset} = dom,
			from = Number(dataset['from']),
			to = Number(dataset['to']);
		view.dispatch({
			effects: foldEffect.of({from, to}),
			selection: {anchor: to},
		});
		dom.remove();
	}
};

export const foldOnIndent: Extension = foldService.of(({doc, tabSize}, start, from) => {
	const {text, number} = doc.lineAt(start);
	if (!text.trim()) {
		return null;
	}
	const getIndent = (line: string): number => /^\s*/u.exec(line)![0].replace(/\t/gu, ' '.repeat(tabSize)).length;
	const indent = getIndent(text);
	let j = number,
		empty = true;
	for (; j < doc.lines; j++) {
		const {text: next} = doc.line(j + 1);
		if (next.trim()) {
			empty = false;
			const nextIndent = getIndent(next);
			if (indent >= nextIndent) {
				break;
			}
		}
	}
	return empty || j === number ? null : {from, to: doc.line(j).to};
});

export const defaultFoldExtension = [foldGutter(), keymap.of(foldKeymap)];
