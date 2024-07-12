import {escapeHTML, escapeURI} from '../src/escape';
import type {editor, KeyCode} from 'monaco-editor';

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
			ranges = editor.getSelections()!;
		if (ranges.every(range => range.isEmpty())) {
			editor.trigger(id, command, undefined);
			return;
		}
		const edits = editor.getSelections()!.map(range => ({
			range,
			text: f(model.getValueInRange(range)),
		}));
		editor.executeEdits(id, edits);
	},
});

export const getEscapeActions = () => [
	createAction('escape.html', 'Escape HTML Entity', 'BracketLeft', 'editor.action.indentLines', escapeHTML),
	createAction('escape.uri', 'URI Encode/Decode', 'BracketRight', 'editor.action.outdentLines', escapeURI),
] as const;
