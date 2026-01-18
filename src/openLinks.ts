import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config.js';
import {isMac} from './constants.js';
import {hasTag} from './util.js';
import type {Extension} from '@codemirror/state';
import type {CodeMirror6} from './codemirror';
import type {MwConfig} from './token';
import type {TagName} from './config';

declare type ISBNParser = (link: string) => string;

const tags: TagName[] = ['extLinkProtocol', 'extLink', 'freeExtLinkProtocol', 'freeExtLink', 'magicLink', 'pageName'],
	links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'],
	pagename = '.cm-mw-pagename',
	wikiLinks = [
		'template-name',
		'link-pagename',
		`parserfunction${pagename}`,
		`exttag-attribute-value${pagename}`,
		`file-text${pagename}`,
	],
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
	view: EditorView,
	isbnParser?: ISBNParser,
	titleParser?: MwConfig['titleParser'],
): string | undefined => {
	if (
		!e[modKey]
		|| !(e.target instanceof Element && getComputedStyle(e.target).textDecorationLine === 'underline')
	) {
		return undefined;
	}
	const position = view.posAtCoords(e);
	if (!position) {
		return undefined;
	}
	const {state} = view,
		tree = ensureSyntaxTree(state, position);
	if (!tree) {
		return undefined;
	}
	let node = tree.resolve(position, -1);
	if (node.name.includes(tokens.linkToSection)) {
		node = node.prevSibling!;
	} else if (!hasTag(new Set(node.name.split('_')), tags)) {
		node = tree.resolve(position, 1);
	}
	const {name, from, to} = node;
	if (name.includes('-extlink-protocol')) {
		return wrapURL(state.sliceDoc(from, node.nextSibling!.to));
	} else if (name.includes(tokens.pageName) && typeof titleParser === 'function') {
		return titleParser(state, node);
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

export default (
	articlePath?: string,
) => (
	{langConfig}: CodeMirror6,
): Extension => {
	const isbnParser = getISBNParser(
		articlePath || langConfig?.articlePath,
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
					langConfig?.titleParser,
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
			[
				...links,
				...langConfig?.titleParser ? wikiLinks : [],
			]
				.map(type => `.cm-mw-${type}`).join()
			]: {
				cursor: 'var(--codemirror-cursor)',
			},
		}),
	];
};
