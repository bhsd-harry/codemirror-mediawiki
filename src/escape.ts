import {CodeMirror6} from './codemirror';
import type {KeyBinding, Command} from '@codemirror/view';

const entity = {'"': 'quot', "'": 'apos', '<': 'lt', '>': 'gt', '&': 'amp', ' ': 'nbsp'};

/**
 * 根据函数转换选中文本
 * @param func 转换函数
 */
const convert = (func: (str: string) => string): Command => (view): true => {
		CodeMirror6.replaceSelections(view, func);
		return true;
	},
	escapeHTML = convert(str => [...str].map(c => {
		if (c in entity) {
			return `&${entity[c as keyof typeof entity]};`;
		}
		const code = c.codePointAt(0)!;
		return code < 256 ? `&#${code};` : `&#x${code.toString(16)};`;
	}).join('')),
	escapeURI = convert(str => {
		if (str.includes('%')) {
			try {
				return decodeURIComponent(str);
			} catch {}
		}
		return encodeURIComponent(str);
	});

export const escapeKeymap: KeyBinding[] = [
	{key: 'Mod-[', run: escapeHTML},
	{key: 'Mod-]', run: escapeURI},
];
