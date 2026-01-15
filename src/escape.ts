import {EditorSelection} from '@codemirror/state';
import {indentMore, indentLess} from '@codemirror/commands';
import {getLSP} from '@bhsd/browser';
import {base} from './constants.js';
import {
	replaceSelections,
} from './codemirror.js';
import {
	sliceDoc,
	toConfigGetter,
	updateCDN,
} from './util.js';
import type {
	EditorView,
	Command,
	KeyBinding,
} from '@codemirror/view';
import type {
	SelectionRange,
} from '@codemirror/state';
import type {ConfigGetter} from '@bhsd/browser';
import type {ConfigData} from 'wikiparser-node';

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
			true,
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

/**
 * Get the [escape](https://github.com/bhsd-harry/codemirror-mediawiki/tree/wikitext#escapekeymap)
 * key bindings for Wikitext.
 * @param configData [WikiParser-Node](https://www.npmjs.com/package/wikiparser-node) configuration data.
 * @param cdn [jsDelivr CDN](https://www.jsdelivr.com/network), defaulting to `https://testingcf.jsdelivr.net`
 */
export default (
	configData: ConfigData,
	cdn?: string,
): KeyBinding[] => {
	updateCDN(cdn);
	return [
		{key: 'Mod-[', run: convert(escapeHTML, indentLess)},
		{key: 'Mod-]', run: convert(escapeURI, indentMore)},
		{
			key: 'Mod-\\',
			run(view): boolean {
				return escapeWiki(
					view,
					toConfigGetter(
						configData,
					),
				);
			},
		},
	];
};
