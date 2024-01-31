import {CodeMirror} from './base';
import type {KeyBinding, Command} from '@codemirror/view';

const entity = {'"': 'quot', "'": 'apos', '<': 'lt', '>': 'gt', '&': 'amp', ' ': 'nbsp'};
const convert = (func: (str: string) => string): Command => (view): true => {
		CodeMirror.replaceSelections(view, func);
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
	}),
	escapeHash = convert(str => {
		try {
			return decodeURIComponent(str.replace(/\.(?=[\da-f]{2})/giu, '%'));
		} catch {
			return str;
		}
	});

export const keymap: KeyBinding[] = [
	{key: 'Mod-/', run: escapeHTML},
	{key: 'Mod-\\', run: escapeURI},
	{key: 'Shift-Mod-\\', run: escapeHash},
];
