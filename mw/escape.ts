import {escapeHTML, escapeURI} from '../src/escape';
import type {editor, KeyCode} from 'monaco-editor';

/**
 * 创建单个Monaco编辑器动作
 * @param id 动作名
 * @param label 动作标签
 * @param key 快捷键
 * @param command 后备指令
 * @param f 字符串处理函数
 */
const createAction = (
	id: string,
	label: string,
	key: keyof typeof KeyCode,
	command: string,
	f: (s: string) => string,
): editor.IActionDescriptor => ({
	id,
	label,
	keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode[key]], // eslint-disable-line no-bitwise
	contextMenuGroupId: '1_modification',
	run(editor): void {
		const model = editor.getModel()!,
			ranges = editor.getSelections()!.filter(range => !range.isEmpty());
		if (ranges.length === 0) {
			editor.trigger(id, command, undefined);
		} else {
			const edits = ranges.map(range => ({
				range,
				text: f(model.getValueInRange(range)),
			}));
			editor.executeEdits(id, edits);
		}
	},
});

/** 创建Monaco编辑器的转义动作 */
export const getEscapeActions = () => [
	createAction('escape.html', 'Escape HTML Entity', 'BracketLeft', 'editor.action.indentLines', escapeHTML),
	createAction('escape.uri', 'URI Encode/Decode', 'BracketRight', 'editor.action.outdentLines', escapeURI),
] as const;
