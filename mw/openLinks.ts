import {isMac} from './msg';
import type {CodeMirror} from './base';

declare type MouseEventListener = (e: MouseEvent) => void;

const modKey = isMac ? 'metaKey' : 'ctrlKey',
	regex = /-template-name|-link-pagename/u,
	handlers = new WeakMap<CodeMirror, MouseEventListener>();

/**
 * 点击时在新页面打开链接、模板等
 * @param cm CodeMirror实例
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
			node = cm.getNodeAt(view.posAtCoords(e)!);
		if (!node || !regex.test(node.name)) {
			return;
		}
		e.preventDefault();
		const {name} = node;
		let prev = node,
			next = node;
		while (prev.prevSibling?.name === name) {
			prev = prev.prevSibling!;
		}
		while (next.nextSibling?.name === name) {
			next = next.nextSibling!;
		}
		let page = view.state.sliceDoc(prev.from, next.to).trim();
		if (page.startsWith('/')) {
			page = `:${mw.config.get('wgPageName')}${page}`;
		}
		open(new mw.Title(page, name.includes('-template-name') ? 10 : 0).getUrl(undefined), '_blank');
	};
	handlers.set(cm, handler);
	return handler;
};

/**
 * 添加或移除打开链接的事件
 * @param cm CodeMirror实例
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
