import {msg, i18n} from './msg';
import type {CodeMirror} from './base';

const storageKey = 'codemirror-mediawiki-addons';
export const indentKey = 'codemirror-mediawiki-indent',
	prefs = new Set<string>(JSON.parse(localStorage.getItem(storageKey)!) as string[] | null);

// OOUI组件
let dialog: OO.ui.MessageDialog | undefined,
	widget: OO.ui.CheckboxMultiselectInputWidget,
	indentWidget: OO.ui.TextInputWidget,
	field: OO.ui.FieldLayout,
	indentField: OO.ui.FieldLayout,
	indent = localStorage.getItem(indentKey) || '';

/**
 * 打开设置对话框
 * @param editors CodeMirror实例
 */
export const openPreference = async (editors: (CodeMirror | undefined)[]): Promise<void> => {
	await mw.loader.using(['oojs-ui-windows', 'oojs-ui.styles.icons-content']);
	if (dialog) {
		widget.setValue([...prefs] as unknown as string);
		indentWidget.setValue(indent);
	} else {
		dialog = new OO.ui.MessageDialog();
		const windowManager = new OO.ui.WindowManager();
		windowManager.$element.appendTo(document.body);
		windowManager.addWindows([dialog]);
		widget = new OO.ui.CheckboxMultiselectInputWidget({
			options: Object.keys(i18n)
				.filter(k => k !== 'addon-indent' && k.startsWith('addon-') && !k.endsWith('-mac'))
				.map(k => ({data: k.slice(6), label: $($.parseHTML(msg(k)))})),
			value: [...prefs] as unknown as string,
		});
		field = new OO.ui.FieldLayout(widget, {
			label: msg('label'),
			align: 'top',
		});
		indentWidget = new OO.ui.TextInputWidget({value: indent, placeholder: '\\t'});
		indentField = new OO.ui.FieldLayout(indentWidget, {label: msg('addon-indent')});
	}

	const data = await (dialog.open({
		title: msg('title'),
		message: field.$element.add(indentField.$element).add($('<p>', {html: msg('feedback')})),
		actions: [
			{action: 'reject', label: mw.msg('ooui-dialog-message-reject')},
			{action: 'accept', label: mw.msg('ooui-dialog-message-accept'), flags: 'progressive'},
		],
		size: 'medium',
	}).closing as unknown as Promise<{action?: unknown} | undefined>);
	if (typeof data === 'object' && data.action === 'accept') {
		const value = widget.getValue() as unknown as string[];
		indent = indentWidget.getValue(); // eslint-disable-line require-atomic-updates
		prefs.clear();
		for (const option of value) {
			prefs.add(option);
		}
		for (const cm of editors) {
			cm?.prefer(value);
			cm?.setIndent(indent || '\t');
		}
		localStorage.setItem(storageKey, JSON.stringify(value));
		localStorage.setItem(indentKey, indent);
	}
};
