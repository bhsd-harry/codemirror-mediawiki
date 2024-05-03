import {CodeMirror} from './base';

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
		return getInstance(this).view!.state.doc.toString();
	},
	setContents(this: JQuery<HTMLTextAreaElement>, content: string): JQuery<HTMLTextAreaElement> {
		getInstance(this).setContent(content);
		return this;
	},
	getSelection(this: JQuery<HTMLTextAreaElement>): string {
		const {state} = getInstance(this).view!,
			{selection: {main: {from, to}}} = state;
		return state.sliceDoc(from, to);
	},
	setSelection(
		this: JQuery<HTMLTextAreaElement>,
		{start, end = start}: {start: number, end?: number},
	): JQuery<HTMLTextAreaElement> {
		getInstance(this).view!.dispatch({
			selection: {anchor: start, head: end},
		});
		return this;
	},
	replaceSelection(this: JQuery<HTMLTextAreaElement>, value: string): JQuery<HTMLTextAreaElement> {
		const {view} = getInstance(this);
		view!.dispatch(view!.state.replaceSelection(value));
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
			{state} = view!;
		const handleOwnline = (from: number, to: number, text: string): [string, number, number] => {
			let start = 0,
				end = 0;
			if (ownline) {
				if (from > 0 && !/[\n\r]/u.test(state.sliceDoc(from - 1, from))) {
					text = `\n${text}`; // eslint-disable-line no-param-reassign
					start = 1;
				}
				if (!/[\n\r]/u.test(state.sliceDoc(to, to + 1))) {
					text += '\n'; // eslint-disable-line no-param-reassign
					end = 1;
				}
			}
			return [text, start, end];
		};
		if (ownline && replace && !pre && !post && selectionStart === undefined && /^\s*=.*=\s*$/u.test(peri)) {
			// 单独处理改变标题层级
			const {selection: {main: {from, to}}} = state,
				[insertText] = handleOwnline(from, to, peri);
			view!.dispatch({
				changes: {from, to, insert: insertText},
				selection: {anchor: from + insertText.length},
			});
			return this;
		}
		CodeMirror.replaceSelections(view!, (_, {from, to}) => {
			if (selectionStart !== undefined) {
				/* eslint-disable no-param-reassign */
				from = selectionStart;
				to = selectionEnd!;
				/* eslint-enable no-param-reassign */
			}
			const isSample = selectPeri && from === to,
				selText = replace || from === to ? peri : state.sliceDoc(from, to),
				[insertText, start, end] = handleOwnline(
					from,
					to,
					splitlines
						? selText.split('\n').map(line => `${pre}${line}${post}`).join('\n')
						: `${pre}${selText}${post}`,
				),
				head = from + insertText.length;
			return isSample ? [insertText, from + pre.length + start, head - post.length - end] : [insertText, head];
		});
		return this;
	},
	getCaretPosition(this: JQuery<HTMLTextAreaElement>, option?: {startAndEnd?: boolean}): [number, number] | number {
		const {state: {selection: {main: {from, to, head}}}} = getInstance(this).view!;
		return option?.startAndEnd ? [from, to] : head;
	},
	scrollToCaretPosition(this: JQuery<HTMLTextAreaElement>): JQuery<HTMLTextAreaElement> {
		const cm = getInstance(this);
		cm.scrollTo();
		return this;
	},
};

/**
 * jQuery.textSelection overrides for Monaco Editor.
 * See jQuery.textSelection.js for method documentation
 */
export const monacoTextSelection = {
	getContents(this: JQuery<HTMLTextAreaElement>): string {
		return getInstance(this).model!.getValue();
	},
	setContents(this: JQuery<HTMLTextAreaElement>, content: string): JQuery<HTMLTextAreaElement> {
		getInstance(this).model!.setValue(content);
		return this;
	},
	getSelection(this: JQuery<HTMLTextAreaElement>): string {
		const {model, editor} = getInstance(this);
		return model!.getValueInRange(editor!.getSelection()!);
	},
	setSelection(
		this: JQuery<HTMLTextAreaElement>,
		{start, end = start}: {start: number, end?: number},
	): JQuery<HTMLTextAreaElement> {
		const {model, editor} = getInstance(this),
			{lineNumber: startLineNumber, column: startColumn} = model!.getPositionAt(start),
			{lineNumber: endLineNumber, column: endColumn} = model!.getPositionAt(end);
		editor!.setSelection({startLineNumber, startColumn, endLineNumber, endColumn});
		return this;
	},
	replaceSelection(this: JQuery<HTMLTextAreaElement>, value: string): JQuery<HTMLTextAreaElement> {
		const {editor} = getInstance(this);
		editor!.executeEdits(
			'replaceSelection',
			[{range: editor!.getSelection()!, text: value, forceMoveMarkers: true}],
		);
		return this;
	},
	encapsulateSelection(this: JQuery<HTMLTextAreaElement>, {
		pre = '',
		peri = '',
		post = '',
		ownline,
		replace,
		splitlines,
		selectionStart,
		selectionEnd = selectionStart,
	}: EncapsulateOptions): JQuery<HTMLTextAreaElement> {
		if (selectionStart !== undefined) {
			textSelection.setSelection.call(this, {start: selectionStart, end: selectionEnd!});
		}
		const {model, editor} = getInstance(this),
			selection = editor!.getSelection()!,
			selText = replace || selection.isEmpty() ? peri : model!.getValueInRange(selection),
			insertText = `${ownline && selection.startColumn > 1 ? '\n' : ''}${splitlines
				? selText.split('\n').map(line => `${pre}${line}${post}`).join('\n')
				: `${pre}${selText}${post}`
			}${ownline && selection.endColumn <= model!.getLineLength(selection.endLineNumber) ? '\n' : ''}`;
		editor!.executeEdits('encapsulateSelection', [{range: selection, text: insertText, forceMoveMarkers: true}]);
		return this;
	},
	getCaretPosition(this: JQuery<HTMLTextAreaElement>, option?: {startAndEnd?: boolean}): [number, number] | number {
		const {editor, model} = getInstance(this),
			selection = editor!.getSelection()!,
			to = model!.getOffsetAt(selection.getEndPosition());
		return option?.startAndEnd ? [model!.getOffsetAt(selection.getStartPosition()), to] : to;
	},
	scrollToCaretPosition(this: JQuery<HTMLTextAreaElement>): JQuery<HTMLTextAreaElement> {
		const {editor} = getInstance(this);
		editor!.revealPosition(editor!.getPosition()!);
		return this;
	},
};

