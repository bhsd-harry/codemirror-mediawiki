import {keymap} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import {indentMore, indentLess} from '@codemirror/commands';
import {getLSP} from '@bhsd/browser';
import elt from 'crelt';
import {base} from './constants';
import {
	CodeMirror6,
	menuRegistry,
} from './codemirror';
import type {
	Command,
	EditorView,
} from '@codemirror/view';
import type {Extension, SelectionRange} from '@codemirror/state';

const entity = {'"': 'quot', "'": 'apos', '<': 'lt', '>': 'gt', '&': 'amp', ' ': 'nbsp'};

/**
 * 根据函数转换选中文本
 * @param func 转换函数
 * @param cmd 原命令
 */
const convert = (func: (str: string) => string, cmd: Command): Command => (view): boolean => {
	if (view.state.selection.ranges.some(({empty}) => !empty)) {
		CodeMirror6.replaceSelections(view, func);
		return true;
	}
	return cmd(view);
};
export const escapeHTML = (str: string): string => [...str].map(c => {
		if (c in entity) {
			return `&${entity[c as keyof typeof entity]};`;
		}
		const code = c.codePointAt(0)!;
		return code < 256 ? `&#${code};` : `&#x${code.toString(16)};`;
	}).join(''),
	escapeURI = (str: string): string => {
		if (str.includes('%')) {
			try {
				return decodeURIComponent(str);
			} catch {}
		}
		return encodeURIComponent(str);
	};

const escapeWiki = (cm: CodeMirror6): boolean => {
	const view = cm.view!,
		{state} = view,
		{ranges} = state.selection,
		lsp = getLSP(view, false, cm.getWikiConfig, base.CDN);
	if (lsp && 'provideRefactoringAction' in lsp && ranges.some(({empty}) => !empty)) {
		(async () => {
			const replacements = new WeakMap<SelectionRange, string | undefined>();
			for (const range of ranges) {
				// eslint-disable-next-line no-await-in-loop
				const [action] = await lsp.provideRefactoringAction(state.sliceDoc(range.from, range.to));
				replacements.set(range, action?.edit!.changes!['']![0]!.newText);
			}
			view.dispatch(state.changeByRange(range => {
				const insert = replacements.get(range);
				if (insert === undefined) {
					return {range};
				}
				return {
					range: EditorSelection.range(range.from, range.from + insert.length),
					changes: {from: range.from, to: range.to, insert},
				};
			}));
		})();
		return true;
	}
	return false;
};

const handlerBase = (view: EditorView, e: PointerEvent): void => {
	e.stopPropagation();
	view.focus();
};

let items: HTMLElement[] | undefined;

menuRegistry.push({
	name: 'escape',
	isActionable({lang, view}): boolean {
		return lang === 'mediawiki' && view!.state.selection.ranges.some(({empty}) => !empty);
	},
	getItems(cm): HTMLElement[] {
		if (!items) {
			const view = cm.view!,
				btnHTML = elt('div', 'HTML escape'),
				btnURI = elt('div', 'URI encode/decode');
			btnHTML.addEventListener('click', e => {
				CodeMirror6.replaceSelections(view, escapeHTML);
				handlerBase(view, e);
			});
			btnURI.addEventListener('click', e => {
				CodeMirror6.replaceSelections(view, escapeURI);
				handlerBase(view, e);
			});
			items = [btnHTML, btnURI];
			const lsp = getLSP(view, false, cm.getWikiConfig, base.CDN);
			if (lsp && 'provideRefactoringAction' in lsp) {
				const btnWiki = elt('div', 'Escape with magic words');
				btnWiki.addEventListener('click', e => {
					escapeWiki(cm);
					handlerBase(view, e);
				});
				items.unshift(btnWiki);
			}
		}
		return items;
	},
});

export default (cm: CodeMirror6): Extension => keymap.of([
	{key: 'Mod-[', run: convert(escapeHTML, indentLess)},
	{key: 'Mod-]', run: convert(escapeURI, indentMore)},
	{
		key: 'Mod-\\',
		run(): boolean {
			return escapeWiki(cm);
		},
	},
]);
