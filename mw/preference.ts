import {rules} from 'wikiparser-node/dist/base';
import {msg, i18n, setObject, getObject} from './msg';
import type {CodeMirror} from './base';

const storageKey = 'codemirror-mediawiki-addons',
	wikilintKey = 'codemirror-mediawiki-wikilint';
export const indentKey = 'codemirror-mediawiki-indent',
	prefs = new Set<string>(getObject(storageKey) as string[] | null),
	wikilintConfig = (getObject(wikilintKey) || {}) as Record<Rule, RuleState | undefined>;

// OOUI组件
let dialog: OO.ui.MessageDialog | undefined,
	layout: OO.ui.IndexLayout | undefined,
	panelMain: OO.ui.TabPanelLayout | undefined,
	panelWikilint: OO.ui.TabPanelLayout | undefined,
	widget: OO.ui.CheckboxMultiselectInputWidget,
	indentWidget: OO.ui.TextInputWidget,
	field: OO.ui.FieldLayout,
	indentField: OO.ui.FieldLayout,
	indent = localStorage.getItem(indentKey) || '';

const enum RuleState {
	off = '0',
	error = '1',
	on = '2',
}

const wikilintWidgets = new Map<Rule, OO.ui.DropdownInputWidget>();

mw.loader.addStyleTag(`#cm-preference>.oo-ui-window-frame{height:100%!important}
#cm-preference .oo-ui-panelLayout{overflow:visible}`);

/**
 * 打开设置对话框
 * @param editors CodeMirror实例
 */
export const openPreference = async (editors: (CodeMirror | undefined)[]): Promise<void> => {
	await mw.loader.using(['oojs-ui-windows', 'oojs-ui-widgets', 'oojs-ui.styles.icons-content']);
	if (dialog) {
		widget.setValue([...prefs] as unknown as string);
		indentWidget.setValue(indent);
	} else {
		dialog = new OO.ui.MessageDialog({id: 'cm-preference'});
		const windowManager = new OO.ui.WindowManager();
		windowManager.$element.appendTo(document.body);
		windowManager.addWindows([dialog]);
		layout = new OO.ui.IndexLayout();
		panelMain = new OO.ui.TabPanelLayout('main', {label: msg('title')});
		panelWikilint = new OO.ui.TabPanelLayout('eslint', {label: msg('wikilint')});
		layout.addTabPanels([panelMain, panelWikilint], 0);
		widget = new OO.ui.CheckboxMultiselectInputWidget({
			options: Object.keys(i18n)
				.filter(k => k !== 'addon-indent' && k.startsWith('addon-') && !k.endsWith('-mac'))
				.map(k => ({
					data: k.slice(6),
					label: $($.parseHTML(msg(k))),
					disabled: k === 'addon-wikiEditor' && !mw.loader.getState('ext.wikiEditor'),
				})),
			value: [...prefs] as unknown as string,
		});
		field = new OO.ui.FieldLayout(widget, {
			label: msg('label'),
			align: 'top',
		});
		indentWidget = new OO.ui.TextInputWidget({value: indent, placeholder: '\\t'});
		indentField = new OO.ui.FieldLayout(indentWidget, {label: msg('addon-indent')});
		panelMain.$element.append(
			field.$element,
			indentField.$element,
			$('<p>', {html: msg('feedback', 'codemirror-mediawiki')}),
		);
		panelWikilint.$element.append(
			...rules.map(rule => {
				const state = rule === 'no-arg' ? RuleState.off : RuleState.error,
					dropdown = new OO.ui.DropdownInputWidget({
						options: [
							{data: RuleState.off, label: msg('wikilint-off')},
							{data: RuleState.error, label: msg('wikilint-error')},
							{data: RuleState.on, label: msg('wikilint-on')},
						],
						value: wikilintConfig[rule] || state,
					}),
					f = new OO.ui.FieldLayout(dropdown, {label: rule});
				wikilintWidgets.set(rule, dropdown);
				wikilintConfig[rule] ||= state;
				return f.$element;
			}),
			$('<p>', {html: msg('feedback', 'wikiparser-node')}),
		);
	}

	const data = await (dialog.open({
		message: layout!.$element,
		actions: [
			{action: 'reject', label: mw.msg('ooui-dialog-message-reject')},
			{action: 'accept', label: mw.msg('ooui-dialog-message-accept'), flags: 'progressive'},
		],
		size: 'medium',
	}).closing as unknown as Promise<{action?: unknown} | undefined>);
	if (typeof data === 'object' && data.action === 'accept') {
		for (const [rule, dropdown] of wikilintWidgets) {
			wikilintConfig[rule] = dropdown.getValue() as RuleState;
		}
		setObject(wikilintKey, wikilintConfig);
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
		setObject(storageKey, value);
		localStorage.setItem(indentKey, indent);
	}
};
