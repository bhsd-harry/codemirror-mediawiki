import {indentMore, indentLess} from '@codemirror/commands';
import {CodeMirror6} from './codemirror';
import type {KeyBinding, Command} from '@codemirror/view';

const entity = {'"': 'quot', "'": 'apos', '<': 'lt', '>': 'gt', '&': 'amp', ' ': 'nbsp'};

/**
 * 根据函数转换选中文本
 * @param func 转换函数
 * @param cmd 原命令
 */
const convert = (func: (str: string) => string, cmd: Command): Command => (view): boolean => {
	if (view.state.selection.ranges.some(range => !range.empty)) {
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

export const escapeKeymap: KeyBinding[] = [
	{key: 'Mod-[', run: convert(escapeHTML, indentLess)},
	{key: 'Mod-]', run: convert(escapeURI, indentMore)},
];
