import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {tokens} from './config.js';
import {
	isMac,
	linkSelector,
	mwPrefix,
} from './constants.js';
import type {Extension} from '@codemirror/state';
import type {DOMEventHandlers} from '@codemirror/view';
import type {CodeMirror6} from './codemirror';
import type {MwConfig} from './token';

declare type ISBNParser = (link: string) => string;

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	links = ['extlink-protocol', 'extlink', 'free-extlink-protocol', 'free-extlink', 'magic-link'],
	pagename = `.${mwPrefix}pagename`,
	wikiLinks = /* @__PURE__ */ (() => [
		'template-name',
		'link-pagename',
		`parserfunction${pagename}`,
		`exttag-attribute-value${pagename}`,
		`file-text${pagename}`,
	])(),
	key = isMac ? 'Meta' : 'Control';

const toggleOpenLinks = ({contentDOM}: EditorView, toggle?: boolean): void => {
	contentDOM.style[toggle ? 'setProperty' : 'removeProperty']('--codemirror-cursor', 'pointer');
};

const wrapURL = (url: string): string => url.startsWith('//') ? location.protocol + url : url;

const openInNewTab = (url?: string): true | undefined => {
	if (url) {
		open(url, '_blank', 'noreferrer');
		return true;
	}
	return undefined;
};

/**
 * @implements
 * @test
 */
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

/**
 * @ignore
 * @test
 */
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
	const posAndSide = view.posAndSideAtCoords(e);
	if (!posAndSide) {
		return undefined;
	}
	const {pos, assoc} = posAndSide,
		{state} = view,
		tree = ensureSyntaxTree(state, pos);
	if (!tree) {
		return undefined;
	}
	let node = tree.resolve(pos, assoc);
	if (node.name.includes(tokens.linkToSection)) {
		node = node.prevSibling!;
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

const eventHandlers: DOMEventHandlers<unknown> = {
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
};

const getOpenLinksTheme = (selectors: string[], extra?: string): Extension => EditorView.theme({
	[selectors.join()]: {
		cursor: 'var(--codemirror-cursor)',
	},
	[selectors.map(selector => `${selector}:hover`).join()]: {
		color: 'var(--cm-active)',
	},
	...extra && {
		[extra]: {
			color: 'var(--cm-active)',
		},
	},
});

export const openLinks = (
	articlePath?: string,
) => (
	{langConfig}: CodeMirror6,
): Extension => {
	const isbnParser = getISBNParser(
		articlePath || langConfig?.articlePath,
	);
	return [
		EditorView.domEventHandlers({
			...eventHandlers,
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
				return openInNewTab(url);
			},
		}),
		getOpenLinksTheme(
			[
				...links,
				...langConfig?.titleParser ? wikiLinks : [],
			]
				.map(type => `.${mwPrefix}${type}`),
			`:is(${
				['', 'free-'].flatMap(s => {
					const extlink = `.${mwPrefix}${s}extlink`,
						protocol = `${extlink}-protocol`;
					return [
						`${protocol}:hover+${extlink}`,
						`${protocol}:has(+${extlink}:hover)`,
					];
				}).join()
			})`,
		),
	];
};

export const openLinksForLua = ({langConfig}: CodeMirror6): Extension => langConfig?.titleParser
	? [
		EditorView.domEventHandlers({
			...eventHandlers,
			mousedown(e, view) {
				if (
					e.button !== 0
					|| !e[modKey]
					|| !(e.target instanceof Element && getComputedStyle(e.target).textDecorationLine === 'underline')
				) {
					return undefined;
				}
				const pos = view.posAtCoords(e);
				if (!pos) {
					return undefined;
				}
				const {state} = view,
					tree = ensureSyntaxTree(state, pos);
				if (!tree) {
					return undefined;
				}
				const node = tree.resolve(pos, 0);
				if (node.name === 'string') {
					return openInNewTab(langConfig.titleParser!(state, node));
				}
				return undefined;
			},
		}),
		getOpenLinksTheme([`${linkSelector}>span`]),
	]
	: [];
