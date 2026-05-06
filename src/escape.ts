import {EditorSelection} from '@codemirror/state';
import {indentMore, indentLess} from '@codemirror/commands';
import {getLSP} from '@bhsd/browser';
import elt from 'crelt';
import {baseData} from './constants.js';
import {
	replaceSelections,
	menuRegistry,
} from './codemirror.js';
import {
	sliceDoc,
	toConfigGetter,
} from './util.js';
import type {EditorView, Command, KeyBinding} from '@codemirror/view';
import type {SelectionRange} from '@codemirror/state';
import type {ConfigGetter} from '@bhsd/browser';
import type {CodeMirror6} from './codemirror';

const entity = new Map([
	['"', 'quot'],
	["'", 'apos'],
	['<', 'lt'],
	['>', 'gt'],
	['&', 'amp'],
	[' ', 'nbsp'],
]);

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

/**
 * 转义HTML
 * @param str 输入字符串
 * @test
 */
export const escapeHTML = (str: string): string => [...str].map(c => {
		if (entity.has(c)) {
			return `&${entity.get(c)};`;
		}
		const code = c.codePointAt(0)!;
		return code < 256 ? `&#${code};` : `&#x${code.toString(16)};`;
	}).join(''),

	/**
	 * 转义URI
	 * @param str 输入字符串
	 * @test
	 */
	escapeURI = (str: string): string => {
		if (str.includes('%')) {
			try {
				return decodeURIComponent(str);
			} catch {}
		}
		return encodeURIComponent(str);
	},

	/**
	 * 使用魔术字转义选中文本
	 * @param view
	 * @param lsp LSP实例
	 * @test
	 */
	escapeWiki = async (view: EditorView, lsp: Exclude<ReturnType<typeof getLSP>, undefined>): Promise<void> => {
		const {state} = view,
			{ranges} = state.selection,
			replacements = new WeakMap<SelectionRange, string | undefined>();
		for (const range of ranges) {
			// eslint-disable-next-line no-await-in-loop
			const [action] = await lsp.provideRefactoringAction(sliceDoc(state, range));
			replacements.set(range, action?.edit!.changes!['']![0]!.newText);
		}
		view.dispatch(state.changeByRange(range => {
			const insert = replacements.get(range);
			return insert === undefined
				? {range}
				: {
					range: EditorSelection.range(range.from, range.from + insert.length),
					changes: {from: range.from, to: range.to, insert},
				};
		}));
	};

const escapeWikiCommand = (view: EditorView, getConfig?: ConfigGetter): boolean => {
	const lsp = getLSP(
		view,
		false,
		getConfig,
		baseData.CDN,
	);
	if (lsp && 'provideRefactoringAction' in lsp && view.state.selection.ranges.some(({empty}) => !empty)) {
		void escapeWiki(view, lsp);
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
			const lsp = getLSP(view, false, cm.getWikiConfig, baseData.CDN);
			if (lsp && 'provideRefactoringAction' in lsp) {
				const btnWiki = elt('div', 'Escape with magic words');
				btnWiki.addEventListener('click', e => {
					escapeWikiCommand(view, cm.getWikiConfig);
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
) => (
	cm: CodeMirror6,
): KeyBinding[] => {
	return [
		{key: 'Mod-[', run: convert(escapeHTML, indentLess)},
		{key: 'Mod-]', run: convert(escapeURI, indentMore)},
		{
			key: 'Mod-\\',
			run(view): boolean {
				return escapeWikiCommand(
					view,
					toConfigGetter(
						cm.getWikiConfig,
						articlePath,
					),
				);
			},
		},
	];
};
