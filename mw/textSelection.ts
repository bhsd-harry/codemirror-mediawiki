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
	splitlines?: boolean | undefined;
	selectionStart?: number;
	selectionEnd?: number;
}

declare interface TextSelection {
	getContents(this: JQuery<HTMLTextAreaElement>): string;
	setContents(this: JQuery<HTMLTextAreaElement>, content: string): JQuery<HTMLTextAreaElement>;
	getSelection(this: JQuery<HTMLTextAreaElement>): string;
	setSelection(
		this: JQuery<HTMLTextAreaElement>,
		{start, end}: {start: number, end?: number},
	): JQuery<HTMLTextAreaElement>;
	replaceSelection(this: JQuery<HTMLTextAreaElement>, value: string): JQuery<HTMLTextAreaElement>;
	encapsulateSelection(this: JQuery<HTMLTextAreaElement>, opt: EncapsulateOptions): JQuery<HTMLTextAreaElement>;
	getCaretPosition(this: JQuery<HTMLTextAreaElement>, option?: {startAndEnd?: boolean}): [number, number] | number;
	scrollToCaretPosition(this: JQuery<HTMLTextAreaElement>): JQuery<HTMLTextAreaElement>;
}

const split = (selText: string, {splitlines, pre, post}: EncapsulateOptions): string =>
	splitlines ? selText.split('\n').map(line => pre + line + post).join('\n') : pre + selText + post;

/**
 * jQuery.textSelection overrides for CodeMirror.
 * See jQuery.textSelection.js for method documentation
 */
export const textSelection: TextSelection = {
	getContents() {
		return getInstance(this).view!.state.doc.toString();
	},
	setContents(content) {
		getInstance(this).setContent(content);
		return this;
	},
	getSelection() {
		const {state} = getInstance(this).view!,
			{selection: {main: {from, to}}} = state;
		return state.sliceDoc(from, to);
	},
	setSelection({start, end = start}) {
		getInstance(this).view!.dispatch({
			selection: {anchor: start, head: end},
		});
		return this;
	},
	replaceSelection(value) {
		const {view} = getInstance(this);
		view!.dispatch(view!.state.replaceSelection(value));
		return this;
	},
	encapsulateSelection({
		pre = '',
		peri = '',
		post = '',
		ownline,
		replace,
		selectPeri = true,
		splitlines,
		selectionStart,
		selectionEnd = selectionStart,
	}) {
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
				[insert] = handleOwnline(from, to, peri);
			view!.dispatch({
				changes: {from, to, insert},
				selection: {anchor: from + insert.length},
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
					split(selText, {splitlines, pre, post}),
				),
				head = from + insertText.length;
			return isSample ? [insertText, from + pre.length + start, head - post.length - end] : [insertText, head];
		});
		return this;
	},
	getCaretPosition(option) {
		const {state: {selection: {main: {from, to, head}}}} = getInstance(this).view!;
		return option?.startAndEnd ? [from, to] : head;
	},
	scrollToCaretPosition() {
		const cm = getInstance(this);
		cm.scrollTo();
		return this;
	},
};

/**
 * jQuery.textSelection overrides for Monaco Editor.
 * See jQuery.textSelection.js for method documentation
 */
export const monacoTextSelection: TextSelection = {
	getContents() {
		return getInstance(this).model!.getValue();
	},
	setContents(content) {
		getInstance(this).model!.setValue(content);
		return this;
	},
	getSelection() {
		const {model, editor} = getInstance(this);
		return model!.getValueInRange(editor!.getSelection()!);
	},
	setSelection({start, end = start}) {
		const {model, editor} = getInstance(this),
			startPos = model!.getPositionAt(start),
			endPos = model!.getPositionAt(end);
		editor!.setSelection(new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column));
		return this;
	},
	replaceSelection(text) {
		const {editor} = getInstance(this);
		editor!.executeEdits(
			'replaceSelection',
			[{range: editor!.getSelection()!, text, forceMoveMarkers: true}],
		);
		return this;
	},
	encapsulateSelection({
		pre = '',
		peri = '',
		post = '',
		ownline,
		replace,
		splitlines,
		selectionStart,
		selectionEnd = selectionStart,
	}) {
		if (selectionStart !== undefined) {
			textSelection.setSelection.call(this, {start: selectionStart, end: selectionEnd!});
		}
		const {model, editor} = getInstance(this),
			edits = editor!.getSelections()!.map(range => {
				const selText = replace || range.isEmpty() ? peri : model!.getValueInRange(range),
					text = `${ownline && range.startColumn > 1 ? '\n' : ''}${
						split(selText, {splitlines, pre, post})
					}${ownline && range.endColumn <= model!.getLineLength(range.endLineNumber) ? '\n' : ''}`;
				return {range, text, forceMoveMarkers: true};
			});
		editor!.executeEdits('encapsulateSelection', edits);
		return this;
	},
	getCaretPosition(option) {
		const {editor, model} = getInstance(this),
			selection = editor!.getSelection()!,
			to = model!.getOffsetAt(selection.getEndPosition());
		return option?.startAndEnd ? [model!.getOffsetAt(selection.getStartPosition()), to] : to;
	},
	scrollToCaretPosition() {
		const {editor} = getInstance(this);
		editor!.revealPosition(editor!.getPosition()!);
		return this;
	},
};

