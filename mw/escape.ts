import {escapeHTML, escapeURI} from '../src/escape';
import type {editor, KeyCode, IDisposable} from 'monaco-editor';

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

/** 创建Monaco编辑器的转义动作，需要等待Monaco加载 */
const getEscapeActions = (): editor.IActionDescriptor[] => [
	createAction('escape.html', 'Escape HTML Entity', 'BracketLeft', 'editor.action.indentLines', escapeHTML),
	createAction('escape.uri', 'URI Encode/Decode', 'BracketRight', 'editor.action.outdentLines', escapeURI),
];

const actionMap = new WeakMap<editor.IStandaloneCodeEditor, IDisposable[]>();
let actions: editor.IActionDescriptor[] | undefined;

/**
 * 添加或移除转义动作
 * @param editor
 * @param on 是否添加
 */
export default (editor: editor.IStandaloneCodeEditor, on: boolean | undefined): void => {
	if (on && !actionMap.has(editor)) {
		actions ??= getEscapeActions();
		actionMap.set(editor, actions.map(action => editor.addAction(action)));
	} else if (on === false && actionMap.has(editor)) {
		for (const disposable of actionMap.get(editor)!) {
			disposable.dispose();
		}
		actionMap.delete(editor);
	}
};
