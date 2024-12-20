import {normalizeTitle} from '@bhsd/common';
import {getTree, listen, fromPositions} from 'monaco-wiki/src/tree';
import {isMac} from '../src/openExtLinks';
import {tokens} from '../src/config';
import type {SyntaxNode} from '@lezer/common';
import type {languages, editor, IDisposable} from 'monaco-editor';
import type {AST, TokenTypes} from 'wikiparser-node';
import type {MwConfig} from '../src/codemirror';
import type {CodeMirror} from './base';

declare type MouseEventListener = (e: MouseEvent) => void;

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	handlers = new WeakMap<CodeMirror, MouseEventListener>(),
	srcTags = new Set<string | undefined>(['templatestyles', 'img']),
	citeTags = new Set<string | undefined>(['blockquote', 'del', 'ins', 'q']),
	linkTypes = new Set<TokenTypes | undefined>([
		'link-target',
		'template-name',
		'invoke-module',
		'magic-link',
		'ext-link-url',
		'free-ext-link',
	]);

/**
 * 解析MagicLink
 * @param link 原链接文本
 */
const parseMagicLink = (link: string): string => {
	if (link.startsWith('ISBN')) {
		return new mw.Title(`Special:Booksources/${link.slice(4).replace(/[\p{Zs}\t-]/gu, '').replace(/x$/u, 'X')}`)
			.getUrl(undefined);
	}
	return link.startsWith('RFC')
		? `https://tools.ietf.org/html/rfc${link.slice(3).trim()}`
		: `https://pubmed.ncbi.nlm.nih.gov/${link.slice(4).trim()}`;
};

/**
 * 阻止默认行为并在新页面打开链接
 * @param url 链接
 * @param e 点击事件
 */
const modClick = (url: string, e: MouseEvent): void => {
	e.preventDefault();
	e.stopPropagation();
	open(url, '_blank');
};

/**
 * 点击时在新页面打开链接、模板等
 * @param cm
 * @param e 点击事件
 */
const getHandler = (cm: CodeMirror): MouseEventListener => {
	if (handlers.has(cm)) {
		return handlers.get(cm)!;
	}
	const handler: MouseEventListener = (e): void => {
		if (!e[modKey] || e.button !== 0) {
			return;
		}
		const {view} = cm,
			{state} = view!;
		let node: SyntaxNode | null | undefined = cm.getNodeAt(view!.posAtCoords(e)!);
		if (node?.name.includes(tokens.linkToSection)) {
			node = node.prevSibling;
		}
		if (!node) {
			return;
		}
		const {name, from, to} = node;
		if (name.includes(tokens.pageName)) {
			const {nextSibling} = node;
			let page = state.sliceDoc(from, to).trim();
			if (
				name.includes(tokens.fileText)
				&& new RegExp(`^(?:${(cm.langConfig as MwConfig).urlProtocols})`, 'iu').test(page)
			) {
				modClick(page, e);
			}
			if (page.startsWith('/')) {
				page = `:${mw.config.get('wgPageName')}${page}`;
			}
			let ns = 0;
			if (name.includes(tokens.templateName) || name.includes(tokens.extTagAttributeValue)) {
				ns = 10;
			} else if (name.includes(tokens.parserFunction)) {
				ns = name.includes('mw-widget') ? 274 : 828;
			} else if (nextSibling?.name.includes(tokens.linkToSection)) {
				page += state.sliceDoc(nextSibling.from, nextSibling.to).trim();
			}
			const url = mw.Title.newFromText(normalizeTitle(page), ns)?.getUrl(undefined);
			if (url) {
				modClick(url, e);
			}
		} else if (/-extlink-protocol/u.test(name)) {
			modClick(state.sliceDoc(from, node.nextSibling!.to), e);
		} else if (/-extlink(?:_|$)/u.test(name)) {
			modClick(state.sliceDoc(node.prevSibling!.from, to), e);
		} else if (name.includes(tokens.magicLink)) {
			modClick(parseMagicLink(state.sliceDoc(from, to)), e);
		}
	};
	handlers.set(cm, handler);
	return handler;
};

/**
 * 生成Monaco编辑器的链接
 * @param model
 * @param tree 语法树
 * @param parent 父节点
 * @param grandparent 祖父节点
 */
const generateLinks = (model: editor.ITextModel, tree: AST, parent?: AST, grandparent?: AST): languages.ILink[] => {
	const {type, childNodes, range: [from, to]} = tree;
	if (
		linkTypes.has(type)
		|| type === 'attr-value' && (
			parent?.name === 'src' && srcTags.has(grandparent?.name)
			|| parent?.name === 'cite' && citeTags.has(grandparent?.name)
		)
		|| parent?.type === 'image-parameter' && parent.name === 'link' && parent.childNodes!.length === 1
	) {
		const range = fromPositions(monaco, model, [from, to]);
		let url = model.getValueInRange(range).replace(/<!--.*?(?:-->|$)/gsu, '').trim();
		if (/[<>[\]|{}]/u.test(url)) {
			return [];
		}
		const {urlProtocols} = mw.config.get('extCodeMirrorConfig') as MwConfig,
			protocolRegex = new RegExp(`^(?:${urlProtocols})`, 'iu');
		try {
			if (type === 'magic-link') {
				url = parseMagicLink(url);
			} else if (
				type === 'link-target' || type === 'template-name' || type === 'invoke-module'
				|| type === 'attr-value' && parent?.name === 'src' && grandparent?.name === 'templatestyles'
				|| parent?.type === 'image-parameter' && !protocolRegex.test(url)
			) {
				let ns = 0;
				if (type === 'template-name' || type === 'attr-value') {
					ns = 10;
				} else if (type === 'invoke-module') {
					ns = 828;
				}
				if (url.startsWith('/')) {
					url = `:${mw.config.get('wgPageName')}${url}`;
				}
				url = new mw.Title(normalizeTitle(url), ns).getUrl(undefined);
			}
			if (url.startsWith('//')) {
				url = location.protocol + url;
			} else if (url.startsWith('/')) {
				url = location.origin + url;
			}
			return [{range, url}];
		} catch {
			console.debug(`Unable to parse title: ${url}`);
			return [];
		}
	}
	return childNodes?.flatMap(node => generateLinks(model, node, tree, parent)) ?? [];
};

const linkProvider: languages.LinkProvider = {
	async provideLinks(model) {
		return {links: 'wikiparse' in globalThis ? generateLinks(model, await getTree(model, 9)) : []};
	},
};

let disposable: IDisposable | undefined,
	listener: IDisposable | undefined;

/**
 * 添加或移除打开链接的事件
 * @param cm
 * @param on 是否添加
 * @param isWiki 是否为Wikitext
 */
export default (cm: CodeMirror, on: boolean | undefined, isWiki: boolean): void => {
	const {view, model} = cm;
	if (view) {
		on = isWiki && on; // eslint-disable-line no-param-reassign
		const {scrollDOM} = view,
			handler = getHandler(cm);
		if (on) {
			mw.loader.load('mediawiki.Title');
			scrollDOM.addEventListener('mousedown', handler, {capture: true});
			scrollDOM.style.setProperty('--codemirror-cursor', 'pointer');
		} else if (on === false) {
			scrollDOM.removeEventListener('mousedown', handler, {capture: true});
			scrollDOM.style.removeProperty('--codemirror-cursor');
		}
	} else if (!isWiki || !model) {
		// pass
	} else if (on) {
		disposable ??= monaco.languages.registerLinkProvider('wikitext', linkProvider);
		listener = listen(model);
	} else if (on === false) {
		disposable?.dispose();
		disposable = undefined;
		listener?.dispose();
		listener = undefined;
	}
};
