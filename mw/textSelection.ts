import type {SelectionRange} from '@codemirror/state';
import type {CodeMirror} from './base';

export const instances = new WeakMap<HTMLTextAreaElement, CodeMirror>();

/**
 * 获取CodeMirror实例
 * @param $ele textarea元素的jQuery对象
 */
const getInstance = ($ele: JQuery<HTMLTextAreaElement>): CodeMirror => instances.get($ele[0]!)!;

declare interface EncapsulateOptions {
	pre?: string;
	peri?: string;
	post?: string;
	ownline?: boolean;
	replace?: boolean;
	selectPeri?: boolean;
	splitlines?: boolean;
	selectionStart?: number;
	selectionEnd?: number;
}

/**
 * jQuery.textSelection overrides for CodeMirror.
 * See jQuery.textSelection.js for method documentation
 */
export const textSelection = {
	getContents(this: JQuery<HTMLTextAreaElement>): string {
		return getInstance(this).view.state.doc.toString();
	},
	setContents(this: JQuery<HTMLTextAreaElement>, content: string): JQuery<HTMLTextAreaElement> {
		getInstance(this).setContent(content);
		return this;
	},
	getSelection(this: JQuery<HTMLTextAreaElement>): string {
		const {view: {state}} = getInstance(this),
			{selection: {main: {from, to}}} = state;
		return state.sliceDoc(from, to);
	},
	setSelection(
		this: JQuery<HTMLTextAreaElement>,
		{start, end = start}: {start: number, end?: number},
	): JQuery<HTMLTextAreaElement> {
		getInstance(this).view.dispatch({
			selection: {anchor: start, head: end},
		});
		return this;
	},
	replaceSelection(this: JQuery<HTMLTextAreaElement>, value: string): JQuery<HTMLTextAreaElement> {
		const {view} = getInstance(this);
		view.dispatch(view.state.replaceSelection(value));
		return this;
	},
	encapsulateSelection(this: JQuery<HTMLTextAreaElement>, {
		pre = '',
		peri = '',
		post = '',
		ownline,
		replace,
		selectPeri = true,
		splitlines,
		selectionStart,
		selectionEnd = selectionStart,
	}: EncapsulateOptions): JQuery<HTMLTextAreaElement> {
		const {view} = getInstance(this),
			{state} = view;
		const handleOwnline = (from: number, to: number, text: string): string => {
			/* eslint-disable no-param-reassign */
			if (from > 0 && !/[\n\r]/u.test(state.sliceDoc(from - 1, from))) {
				text = `\n${text}`;
				pre += '\n';
			}
			if (!/[\n\r]/u.test(state.sliceDoc(to, to + 1))) {
				text += '\n';
				post += '\n';
			}
			return text;
			/* eslint-enable no-param-reassign */
		};
		if (ownline && replace && !pre && !post && selectionStart === undefined && /^\s*=.*=\s*$/u.test(peri)) {
			// 单独处理改变标题层级
			const {selection: {main: {from, to}}} = state,
				insertText = handleOwnline(from, to, peri);
			view.dispatch({
				changes: {from, to, insert: insertText},
				selection: {anchor: from + insertText.length},
			});
			return this;
		}
		view.dispatch(state.changeByRange(({from, to}) => {
			if (selectionStart !== undefined) {
				/* eslint-disable no-param-reassign */
				from = selectionStart;
				to = selectionEnd!;
				/* eslint-enable no-param-reassign */
			}
			const isSample = selectPeri && from === to,
				selText = replace || from === to ? peri : state.sliceDoc(from, to);
			let insertText = splitlines
				? selText.split('\n').map(line => `${pre}${line}${post}`).join('\n')
				: `${pre}${selText}${post}`;
			if (ownline) {
				insertText = handleOwnline(from, to, insertText);
			}
			const head = from + insertText.length;
			return {
				changes: {from, to, insert: insertText},
				range: (isSample
					? {anchor: from + pre.length, head: head - post.length}
					: {anchor: head, head}) as SelectionRange,
			};
		}));
		return this;
	},
	getCaretPosition(this: JQuery<HTMLTextAreaElement>, option?: {startAndEnd?: boolean}): [number, number] | number {
		const {view: {state: {selection: {main: {from, to, head}}}}} = getInstance(this);
		return option?.startAndEnd ? [from, to] : head;
	},
	scrollToCaretPosition(this: JQuery<HTMLTextAreaElement>): JQuery<HTMLTextAreaElement> {
		const cm = getInstance(this);
		cm.scrollTo();
		return this;
	},
};
