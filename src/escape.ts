import {keymap} from '@codemirror/view';
import {EditorSelection} from '@codemirror/state';
import {indentMore, indentLess} from '@codemirror/commands';
import {getLSP} from '@bhsd/browser';
import elt from 'crelt';
import {base} from './constants.js';
import {
	replaceSelections,
	menuRegistry,
} from './codemirror.js';
import {
	sliceDoc,
	toConfigGetter,
} from './util.js';
import type {
	EditorView,
	Command,
} from '@codemirror/view';
import type {
	SelectionRange,
	Extension,
} from '@codemirror/state';
import type {ConfigGetter} from '@bhsd/browser';
import type {CodeMirror6} from './codemirror';

const entity = {'"': 'quot', "'": 'apos', '<': 'lt', '>': 'gt', '&': 'amp', ' ': 'nbsp'};

/**
 * 根据函数转换选中文本
 * @param func 转换函数
 * @param cmd 原命令
 */
const convert = (func: (str: string) => string, cmd: Command): Command => (view): boolean => {
	if (view.state.selection.ranges.some(({empty}) => !empty)) {
		replaceSelections(view, func);
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

const escapeWiki = (view: EditorView, getConfig?: ConfigGetter): boolean => {
	const {state} = view,
		{ranges} = state.selection,
		lsp = getLSP(
			view,
			false,
			getConfig,
			base.CDN,
		);
	if (lsp && 'provideRefactoringAction' in lsp && ranges.some(({empty}) => !empty)) {
		(async () => {
			const replacements = new WeakMap<SelectionRange, string | undefined>();
			for (const range of ranges) {
				// eslint-disable-next-line no-await-in-loop
				const [action] = await lsp.provideRefactoringAction(sliceDoc(state, range));
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
				replaceSelections(view, escapeHTML);
				handlerBase(view, e);
			});
			btnURI.addEventListener('click', e => {
				replaceSelections(view, escapeURI);
				handlerBase(view, e);
			});
			items = [btnHTML, btnURI];
			const lsp = getLSP(view, false, cm.getWikiConfig, base.CDN);
			if (lsp && 'provideRefactoringAction' in lsp) {
				const btnWiki = elt('div', 'Escape with magic words');
				btnWiki.addEventListener('click', e => {
					escapeWiki(view, cm.getWikiConfig);
					handlerBase(view, e);
				});
				items.unshift(btnWiki);
			}
		}
		return items;
	},
});

export default (
	articlePath?: string,
) => (cm: CodeMirror6): Extension => keymap.of([
	{key: 'Mod-[', run: convert(escapeHTML, indentLess)},
	{key: 'Mod-]', run: convert(escapeURI, indentMore)},
	{
		key: 'Mod-\\',
		run(view): boolean {
			return escapeWiki(
				view,
				toConfigGetter(
					cm.getWikiConfig,
					articlePath,
				),
			);
		},
	},
]);
