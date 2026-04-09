import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config.js';
import {isMac} from './constants.js';
import {hasTag} from './mediawiki.js';
import type {Extension} from '@codemirror/state';
import type {ConfigData} from 'wikiparser-node';
import type {TagName} from './config';

declare type ISBNParser = (link: string) => string;

const links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'],
	tags: TagName[] = ['extLinkProtocol', 'extLink', 'freeExtLinkProtocol', 'freeExtLink', 'magicLink', 'pageName'],
	modKey = isMac ? 'metaKey' : 'ctrlKey',
	key = isMac ? 'Meta' : 'Control';

const toggleOpenLinks = ({contentDOM}: EditorView, toggle?: boolean): void => {
	contentDOM.style[toggle ? 'setProperty' : 'removeProperty']('--codemirror-cursor', 'pointer');
};

const wrapURL = (url: string): string => url.startsWith('//') ? location.protocol + url : url;

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

export const mouseEventListener = (
	e: MouseEvent,
	// eslint-disable-next-line @typescript-eslint/method-signature-style
	view: EditorView & {posAndSideAtCoords?: (coords: {x: number, y: number}) => {pos: number, assoc: 1 | -1} | null},
	isbnParser?: ISBNParser,
): string | undefined => {
	if (
		!e[modKey]
		|| !(e.target instanceof Element && getComputedStyle(e.target).textDecorationLine === 'underline')
	) {
		return undefined;
	}
	let pos: number | null,
		assoc: 1 | -1 | undefined;
	if (typeof view.posAndSideAtCoords === 'function') {
		const posAndSide = view.posAndSideAtCoords(e);
		if (!posAndSide) {
			return undefined;
		}
		({pos, assoc} = posAndSide);
	} else {
		pos = view.posAtCoords(e);
		if (!pos) {
			return undefined;
		}
	}
	const {state} = view,
		tree = ensureSyntaxTree(state, pos);
	if (!tree) {
		return undefined;
	}
	let node = tree.resolve(pos, assoc ?? -1);
	if (node.name.includes(tokens.linkToSection)) {
		node = node.prevSibling!;
	} else if (assoc === undefined && node.to === pos && !hasTag(node.name, tags)) {
		node = tree.resolve(pos, 1);
	}
	const {name, from, to} = node;
	if (name.includes('-extlink-protocol')) {
		return wrapURL(state.sliceDoc(from, node.nextSibling!.to));
	} else if (/-extlink(?:_|$)/u.test(name)) {
		return wrapURL(state.sliceDoc(node.prevSibling!.from, to));
	} else if (name.includes(tokens.magicLink)) {
		const link = state.sliceDoc(from, to);
		if (link.startsWith('RFC')) {
			return `https://datatracker.ietf.org/doc/html/rfc${link.slice(3).trim()}`;
		} else if (link.startsWith('PMID')) {
			return `https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`;
		}
		return isbnParser?.(link);
	}
	return undefined;
};

/**
 * Get the [openLinks](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#openlinks)
 * extension for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @since 0.2.0
 */
export default (
	configData: ConfigData,
): Extension => {
	const isbnParser = getISBNParser(
		configData.articlePath,
	);
	return [
		EditorView.domEventHandlers({
			mousedown(e, view) {
				if (e.button !== 0) {
					return undefined;
				}
				const url = mouseEventListener(
					e,
					view,
					isbnParser,
				);
				if (url) {
					open(url, '_blank', 'noreferrer');
					return true;
				}
				return undefined;
			},
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
				toggleOpenLinks(view, e[modKey]);
			},
		}),
		EditorView.theme({
			[
			links
				.map(type => `.cm-mw-${type}`).join()
			]: {
				cursor: 'var(--codemirror-cursor)',
			},
		}),
	];
};
