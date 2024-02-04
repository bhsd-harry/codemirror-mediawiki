import type {CodeMirror} from './base';

export const instances = new WeakMap<HTMLTextAreaElement, CodeMirror>();

/**
 * 获取CodeMirror实例
 * @param $ele textarea元素的jQuery对象
 */
const getInstance = ($ele: JQuery<HTMLTextAreaElement>): CodeMirror => instances.get($ele[0]!)!;

function getCaretPosition(this: JQuery<HTMLTextAreaElement>, option: {startAndEnd: true}): [number, number];
function getCaretPosition(this: JQuery<HTMLTextAreaElement>, option?: {startAndEnd?: false}): number;
function getCaretPosition(
	this: JQuery<HTMLTextAreaElement>,
	option?: {startAndEnd?: boolean},
): [number, number] | number {
	const {view: {state: {selection: {main}}}} = getInstance(this);
	return option?.startAndEnd ? [main.from, main.to] : main.head;
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
		const {view: {state}} = getInstance(this);
		return state.sliceDoc(state.selection.main.from, state.selection.main.to);
	},
	setSelection(
		this: JQuery<HTMLTextAreaElement>,
		{start, end}: {start: number, end?: number},
	): JQuery<HTMLTextAreaElement> {
		const {view} = getInstance(this);
		view.dispatch({
			selection: {anchor: start, head: end ?? start},
		});
		view.focus();
		return this;
	},
	replaceSelection(this: JQuery<HTMLTextAreaElement>, value: string): JQuery<HTMLTextAreaElement> {
		const {view} = getInstance(this);
		view.dispatch(view.state.replaceSelection(value));
		return this;
	},
	getCaretPosition,
	scrollToCaretPosition(this: JQuery<HTMLTextAreaElement>): JQuery<HTMLTextAreaElement> {
		getInstance(this).view.dispatch({scrollIntoView: true});
		return this;
	},
};
