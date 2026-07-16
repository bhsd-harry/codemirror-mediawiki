import {EditorView, Decoration} from '@codemirror/view';
import {StateEffect, StateField} from '@codemirror/state';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config.js';
import {
	isMac,
	linkSelector,
	mwPrefix,
} from './constants.js';
import type {Extension, EditorState} from '@codemirror/state';
import type {DecorationSet} from '@codemirror/view';
import type {CodeMirror6} from './codemirror';
import type {MwConfig} from './token';

declare type ISBNParser = (link: string) => string;
declare type ActiveRange = readonly [number, number];
declare interface ActiveRangeSet extends DecorationSet {
	activeRange?: ActiveRange;
}
declare interface Pos {
	pos: number;
	assoc: 1 | -1;
}
declare interface LinkParser {
	(state: EditorState, posAndSide: Pos, string: true): string | undefined;
	(state: EditorState, posAndSide: Pos, string?: false): ActiveRange | undefined;
}

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	key = isMac ? 'Meta' : 'Control',
	links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'],
	pagename = `.${mwPrefix}pagename`,
	wikiLinks = /* #__PURE__ */ (() => [
		'template-name',
		'link-pagename',
		`parserfunction${pagename}`,
		`exttag-attribute-value${pagename}`,
		`file-text${pagename}`,
	])(),
	openLinksCls = 'cm-open-links',
	activeLinkCls = 'cm-active-link',
	activeLink = Decoration.mark({class: activeLinkCls}),
	openLinksEffect = StateEffect.define<Pos | null>();

const toggleOpenLinks = (view: EditorView, toggle = false): void => {
	view.dom.classList.toggle(openLinksCls, toggle);
	if (!toggle) {
		view.dispatch({effects: openLinksEffect.of(null)});
	}
};

const wrapURL = (state: EditorState, range: ActiveRange, str?: boolean): string | ActiveRange => {
	if (!str) {
		return range;
	}
	const url = state.sliceDoc(...range);
	return url.startsWith('//') ? location.protocol + url : url;
};

/**
 * @implements
 * @test
 */
export const getISBNParser = (articlePath?: string): ISBNParser | undefined => articlePath
	? (link: string): string => {
		const page = `Special:Booksources/${
			link.slice(4).replaceAll(/[\p{Zs}\t-]/gu, '')
				.replace(/x$/u, 'X')
		}`;
		return articlePath.includes('$1')
			? articlePath.replace('$1', () => page)
			: articlePath + (articlePath.endsWith('/') ? '' : '/') + page;
	}
	: undefined;

/**
 * @ignore
 * @test
 */
export const getLinkParser = (
	isbnParser?: ISBNParser,
	titleParser?: MwConfig['titleParser'],
): LinkParser =>
	((state, {pos, assoc}, str) => {
		const tree = ensureSyntaxTree(state, pos);
		if (!tree) {
			return undefined;
		}
		let node = tree.resolve(pos, assoc);
		if (node.name.includes(tokens.linkToSection)) {
			node = node.prevSibling!;
		}
		const {name, from, to, nextSibling, prevSibling} = node;
		if (name.includes('-extlink-protocol')) {
			return wrapURL(state, [from, nextSibling!.to], str);
		} else if (/-extlink(?:_|$)/u.test(name)) {
			return wrapURL(state, [prevSibling!.from, to], str);
		} else if (name.includes(tokens.magicLink)) {
			const link = state.sliceDoc(from, to);
			if (link.startsWith('ISBN')) {
				return isbnParser && (str ? isbnParser(link) : [from, to]);
			} else if (!str) {
				return [from, to];
			}
			return link.startsWith('RFC')
				? `https://datatracker.ietf.org/doc/html/rfc${link.slice(3).trim()}`
				: `https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`;
		} else if (name.includes(tokens.pageName)) {
			return titleParser && (str ? titleParser(state, node)?.page : [from, to]);
		}
		return undefined;
	}) as LinkParser;

export const getOpenLinksExtension = (
	linkParser: LinkParser,
	selectors: string[],
): Extension => {
	const selector = selectors.map(sel => `& ${sel}`).join();
	return [
		StateField.define<ActiveRangeSet>({
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
							&& (activeRange[0] < pos || assoc === 1 && activeRange[0] === pos)
							&& (activeRange[1] > pos || assoc === -1 && activeRange[1] === pos)
						) {
							return deco;
						}
						const range = linkParser(state, value);
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
		}),
		EditorView.domEventHandlers({
			keydown(e, view) {
				if (e.key === key) {
					toggleOpenLinks(view, true);
				}
			},
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
			mousedown(e, view) {
				if (
					e.button !== 0
					|| !e[modKey]
					|| getComputedStyle(e.target as HTMLElement).textDecorationLine !== 'underline'
				) {
					return undefined;
				}
				const posAndSide = view.posAndSideAtCoords(e),
					url = posAndSide && linkParser(view.state, posAndSide, true);
				if (url) {
					open(url, '_blank', 'noreferrer');
					return true;
				}
				return undefined;
			},
		}),
		EditorView.theme({
			[`.${activeLinkCls}`]: {
				[selector]: {
					color: 'var(--cm-active)',
				},
			},
			[`&.${openLinksCls}`]: {
				[selector]: {
					cursor: 'pointer',
				},
			},
		}),
	];
};

export const openLinks = (
	articlePath?: string,
) => (
	{langConfig}: CodeMirror6,
): Extension => {
	const titleParser = langConfig?.titleParser;
	return getOpenLinksExtension(
		getLinkParser(
			getISBNParser(
				articlePath || langConfig?.articlePath,
			),
			titleParser,
		),
		[...links, ...titleParser ? wikiLinks : []].map(type => `.${mwPrefix}${type}`),
	);
};

export const openLinksForLua = ({langConfig}: CodeMirror6): Extension => langConfig?.titleParser
	? getOpenLinksExtension(
		((state, {pos}, str) => {
			const node = ensureSyntaxTree(state, pos)?.resolve(pos, 0);
			return node?.name === 'string' ? langConfig.titleParser!(state, node)?.[str ? 'page' : 'range'] : undefined;
		}) as LinkParser,
		[`${linkSelector}>span`],
	)
	: [];
