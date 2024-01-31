import {msg} from './msg';
import type {CodeMirror} from './base';

const options = [
	'allowMultipleSelections',
	'bracketMatching',
	'closeBrackets',
	'highlightActiveLine',
	'highlightSpecialChars',
	'highlightWhitespace',
	'highlightTrailingWhitespace',
	'lint',
	'openLinks',
];

// OOUI组件
let dialog: OO.ui.MessageDialog | undefined,
	widget: OO.ui.CheckboxMultiselectInputWidget,
	field: OO.ui.FieldLayout;

export const storageKey = 'codemirror-mediawiki-addons';

/**
 * 打开设置对话框
 * @param addons 预设的扩展
 * @param editors CodeMirror实例
 */
export const openPreference = async (addons: Set<string>, editors: (CodeMirror | undefined)[]): Promise<void> => {
	await mw.loader.using(['oojs-ui-windows', 'oojs-ui.styles.icons-content']);
	if (dialog) {
		widget.setValue([...addons] as unknown as string);
	} else {
		dialog = new OO.ui.MessageDialog();
		const windowManager = new OO.ui.WindowManager();
		windowManager.$element.appendTo(document.body);
		windowManager.addWindows([dialog]);
		widget = new OO.ui.CheckboxMultiselectInputWidget({
			options: options.map(option => ({data: option, label: msg(`addon-${option}`)})),
			value: [...addons] as unknown as string,
		});
		field = new OO.ui.FieldLayout(widget, {
			label: msg('label'),
			notices: [msg('notice')],
			align: 'top',
		});
	}

	const data = await (dialog.open({
		title: msg('title'),
		message: field.$element.add($('<p>', {html: msg('feedback')})),
		actions: [
			{action: 'reject', label: mw.msg('ooui-dialog-message-reject')},
			{action: 'accept', label: mw.msg('ooui-dialog-message-accept'), flags: 'progressive'},
		],
		size: 'medium',
	}).closing as unknown as Promise<{action?: unknown} | undefined>);
	if (typeof data === 'object' && data.action === 'accept') {
		const value = widget.getValue() as unknown as string[];
		addons.clear();
		for (const option of value) {
			addons.add(option);
		}
		for (const cm of editors) {
			cm?.prefer(value);
		}
		localStorage.setItem(storageKey, JSON.stringify(value));
	}
};
