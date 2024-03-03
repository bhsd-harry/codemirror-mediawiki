import type {CodeMirror} from './base';

export const instances = new WeakMap<HTMLTextAreaElement, CodeMirror>();

/**
 * 获取CodeMirror实例
 * @param $ele textarea元素的jQuery对象
 */
const getInstance = ($ele: JQuery<HTMLTextAreaElement>): CodeMirror => instances.get($ele[0]!)!;

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
		view.dispatch({selection: view.state.selection.asSingle()});
		view.dispatch(view.state.replaceSelection(value));
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
