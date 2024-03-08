import {isMac} from './msg';
import type {SyntaxNode} from '@lezer/common';
import type {CodeMirror} from './base';

declare type MouseEventListener = (e: MouseEvent) => void;

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	handlers = new WeakMap<CodeMirror, MouseEventListener>();

/**
 * 获取节点的名称
 * @param node 语法树节点
 */
function getName(node: SyntaxNode): string;
function getName(node: null): undefined;
function getName(node: SyntaxNode | null): string | undefined {
	return node?.name.replace(/_+/gu, ' ').trim();
}

/**
 * 查找连续同名节点
 * @param node 起始节点
 * @param dir 方向
 * @param name 节点名称
 */
const search = (node: SyntaxNode, dir: 'prevSibling' | 'nextSibling', name = getName(node)): SyntaxNode => {
	while (getName(node[dir]!) === name) {
		node = node[dir]!; // eslint-disable-line no-param-reassign
	}
	return node;
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
		if (!e[modKey]) {
			return;
		}
		const {view} = cm,
			{state} = view,
			node = cm.getNodeAt(view.posAtCoords(e)!);
		if (!node) {
			// pass
		} else if (/-template-name|-link-pagename/u.test(node.name)) {
			e.preventDefault();
			const name = getName(node);
			let page = state.sliceDoc(
				search(node, 'prevSibling', name).from,
				search(node, 'nextSibling', name).to,
			).trim();
			if (page.startsWith('/')) {
				page = `:${mw.config.get('wgPageName')}${page}`;
			}
			open(new mw.Title(page, name.includes('-template-name') ? 10 : 0).getUrl(undefined), '_blank');
		} else if (/-extlink-protocol/u.test(node.name)) {
			e.preventDefault();
			open(state.sliceDoc(node.from, search(node.nextSibling!, 'nextSibling').to), '_blank');
		} else if (/-extlink(?:_|$)/u.test(node.name)) {
			e.preventDefault();
			const name = getName(node),
				prev = search(node, 'prevSibling', name).prevSibling!,
				next = search(node, 'nextSibling', name);
			open(state.sliceDoc(prev.from, next.to), '_blank');
		}
	};
	handlers.set(cm, handler);
	return handler;
};

/**
 * 添加或移除打开链接的事件
 * @param cm
 * @param on 是否添加
 */
export const openLinks = (cm: CodeMirror, on?: boolean): void => {
	const {view: {contentDOM}} = cm;
	if (on) {
		mw.loader.load('mediawiki.Title');
		contentDOM.addEventListener('click', getHandler(cm));
		contentDOM.style.setProperty('--codemirror-cursor', 'pointer');
	} else if (on === false) {
		contentDOM.removeEventListener('click', getHandler(cm));
		contentDOM.style.removeProperty('--codemirror-cursor');
	}
};
