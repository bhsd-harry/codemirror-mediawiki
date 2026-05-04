/* eslint-disable @stylistic/function-paren-newline */
import {EditorView, Decoration} from '@codemirror/view';
import {StateEffect, StateField} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config.js';
import {
	isMac,
} from './constants.js';
import type {Extension, EditorState} from '@codemirror/state';
import type {DecorationSet} from '@codemirror/view';
import type {ConfigData} from 'wikiparser-node';

declare type ISBNParser = (link: string) => string;

declare interface ActiveRangeSet extends DecorationSet {
	activeRange?: readonly [number, number];
}
declare interface Pos {
	pos: number;
	assoc: 1 | -1;
}

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	key = isMac ? 'Meta' : 'Control',
	activeLinkCls = 'cm-active-link',
	activeLink = Decoration.mark({class: activeLinkCls}),
	openLinksEffect = StateEffect.define<Pos | null>();

const toggleOpenLinks = (view: EditorView, toggle = false): void => {
	if (!toggle) {
		view.dispatch({effects: openLinksEffect.of(null)});
	}
};

const wrapURL = (url: string): string => url.startsWith('//') ? location.protocol + url : url;

const openInNewTab = (url?: string): true | undefined => {
	if (url) {
		open(url, '_blank', 'noreferrer');
		return true;
	}
	return undefined;
};

export const getISBNParser = (articlePath?: string): ISBNParser | undefined => articlePath
	? (link: string): string => {
		const page = `Special:Booksources/${
			link.slice(4).replace(/[\p{Zs}\t-]/gu, '')
				.replace(/x$/u, 'X')
		}`;
		return articlePath.includes('$1')
			? articlePath.replace('$1', page)
			: articlePath + (articlePath.endsWith('/') ? '' : '/') + page;
	}
	: undefined;

export function getLink(
	state: EditorState,
	{pos, assoc}: Pos,
	str: false,
	isbnParser?: ISBNParser,
): readonly [number, number] | undefined;
export function getLink(
	state: EditorState,
	{pos, assoc}: Pos,
	str: true,
	isbnParser?: ISBNParser,
): string | undefined;
export function getLink(
	state: EditorState,
	{pos, assoc}: Pos,
	str: boolean,
	isbnParser?: ISBNParser,
): readonly [number, number] | string | undefined {
	const tree = ensureSyntaxTree(state, pos);
	if (!tree) {
		return undefined;
	}
	let node = tree.resolve(pos, assoc);
	if (node.name.includes(tokens.linkToSection)) {
		node = node.prevSibling!;
	}
	const {name, from, to} = node;
	if (name.includes('-extlink-protocol')) {
		const range = [from, node.nextSibling!.to] as const;
		return str ? wrapURL(state.sliceDoc(...range)) : range;
	} else if (/-extlink(?:_|$)/u.test(name)) {
		const range = [node.prevSibling!.from, to] as const;
		return str ? wrapURL(state.sliceDoc(...range)) : range;
	} else if (name.includes(tokens.magicLink)) {
		if (!str) {
			return [from, to];
		}
		const link = state.sliceDoc(from, to);
		if (link.startsWith('RFC')) {
			return `https://datatracker.ietf.org/doc/html/rfc${link.slice(3).trim()}`;
		} else if (link.startsWith('PMID')) {
			return `https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`;
		}
		return isbnParser?.(link);
	}
	return undefined;
}

const eventHandlers: DOMEventHandlers<unknown> = {
	keyup(e, view) {
		if (e.key === key) {
			toggleOpenLinks(view);
		}
	},
	mousemove(e, view) {
		const toggle = e[modKey];
		toggleOpenLinks(view, toggle);
		if (toggle) {
			view.dispatch({effects: openLinksEffect.of(view.posAndSideAtCoords(e))});
		}
	},
};

const getOpenLinksTheme = (
// eslint-disable-next-line arrow-body-style
): Extension => {
	return EditorView.theme({
		[`.${activeLinkCls}`]: {
			cursor: 'pointer',
		},
	});
};

const notOpenableLink = (e: MouseEvent): boolean => e.button !== 0
	|| !e[modKey];

export const getOpenLinksField = (
	findActiveRange: (state: EditorState, posAndSide: Pos) => readonly [number, number] | undefined,
): Extension => StateField.define<ActiveRangeSet>({
	create() {
		return Decoration.none;
	},
	update(deco, {effects, state, docChanged}) {
		if (docChanged) {
			return Decoration.none;
		}
		for (const effect of effects) {
			if (effect.is(openLinksEffect)) {
				const {value} = effect;
				if (!value) {
					return Decoration.none;
				}
				const {pos, assoc} = value,
					{activeRange} = deco;
				if (
					activeRange
					&& (activeRange[0] < pos || activeRange[0] === pos && assoc === 1)
					&& (activeRange[1] > pos || activeRange[1] === pos && assoc === -1)
				) {
					return deco;
				}
				const range = findActiveRange(state, value);
				if (range) {
					const set: ActiveRangeSet = Decoration.set(activeLink.range(...range));
					set.activeRange = range;
					return set;
				}
				return Decoration.none;
			}
		}
		return deco;
	},
	compare(a, b) {
		return a.activeRange?.[0] === b.activeRange?.[0] && a.activeRange?.[1] === b.activeRange?.[1];
	},
	provide(f) {
		return EditorView.decorations.from(f);
	},
});

/**
 * Get the [openLinks](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#openlinks)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @since 0.2.0
 */
export const openLinks = (
	configData: ConfigData,
): Extension => {
	const isbnParser = getISBNParser(
		configData.articlePath,
	);
	return [
		getOpenLinksField(
			(state, posAndSide) => getLink(
				state,
				posAndSide,
				false,
				isbnParser,
			),
		),
		EditorView.domEventHandlers({
			...eventHandlers,
			mousedown(e, view) {
				if (notOpenableLink(e)) {
					return undefined;
				}
				const posAndSide = view.posAndSideAtCoords(e);
				if (!posAndSide) {
					return undefined;
				}
				const url = getLink(
					view.state,
					posAndSide,
					true,
					isbnParser,
				);
				return openInNewTab(url);
			},
		}),
		getOpenLinksTheme(
		),
	];
};
