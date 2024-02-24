import {rules} from 'wikiparser-node/dist/base';
import {CodeMirror} from './base';
import {msg, i18n, setObject, getObject} from './msg';
import {instances} from './textSelection';

const storageKey = 'codemirror-mediawiki-addons',
	wikilintKey = 'codemirror-mediawiki-wikilint',
	codeKeys = ['ESLint', 'Stylelint'] as const;

declare type codeKey = typeof codeKeys[number];

export const indentKey = 'codemirror-mediawiki-indent',
	prefs = new Set<string>(getObject(storageKey) as string[] | null),
	wikilintConfig = (getObject(wikilintKey) || {}) as Record<Rule, RuleState | undefined>,
	codeConfigs = new Map(codeKeys.map(k => [k, getObject(`codemirror-mediawiki-${k}`)]));

// OOUI组件
let dialog: OO.ui.MessageDialog | undefined,
	layout: OO.ui.IndexLayout,
	widget: OO.ui.CheckboxMultiselectInputWidget,
	indentWidget: OO.ui.TextInputWidget,
	indent = localStorage.getItem(indentKey) || '';
const widgets: Partial<Record<codeKey, OO.ui.MultilineTextInputWidget>> = {};

const enum RuleState {
	off = '0',
	error = '1',
	on = '2',
}

const wikilintWidgets = new Map<Rule, OO.ui.DropdownInputWidget>();

mw.loader.addStyleTag(`#cm-preference>.oo-ui-window-frame{height:100%!important}
#cm-preference .oo-ui-panelLayout{overflow:visible}
#cm-preference .cm-editor{border:1.5px solid #dedede;border-radius:.3em}`);

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
		const panelMain = new OO.ui.TabPanelLayout('main', {label: msg('title')}),
			panelWikilint = new OO.ui.TabPanelLayout('wikilint', {label: 'WikiLint'}),
			panels: Partial<Record<codeKey, OO.ui.TabPanelLayout>> = {};
		for (const key of codeKeys) {
			const c = codeConfigs.get(key);
			widgets[key] = new OO.ui.MultilineTextInputWidget({
				value: c ? JSON.stringify(c, null, indent || '\t') : '',
			});
			const codeField = new OO.ui.FieldLayout(widgets[key]!, {label: msg(`${key}-config`), align: 'top'}),
				panel = new OO.ui.TabPanelLayout(key, {label: key, $content: codeField.$element});
			panel.on('active', active => {
				const [textarea] = panel.$element.find('textarea') as unknown as [HTMLTextAreaElement];
				if (active && !instances.has(textarea)) {
					void CodeMirror.fromTextArea(textarea, 'json');
				}
			});
			panels[key] = panel;
		}
		layout.addTabPanels([panelMain, panelWikilint, ...Object.values(panels)], 0);
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
		indentWidget = new OO.ui.TextInputWidget({value: indent, placeholder: '\\t'});
		const field = new OO.ui.FieldLayout(widget, {
				label: msg('label'),
				align: 'top',
			}),
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
		const jsonErrors: string[] = [];
		for (const key of codeKeys) {
			try {
				const config = JSON.parse(widgets[key]!.getValue().trim() || 'null');
				codeConfigs.set(key, config);
				setObject(`codemirror-mediawiki-${key}`, config);
			} catch {
				jsonErrors.push(key);
			}
		}
		if (jsonErrors.length > 0) {
			void OO.ui.alert(msg('json-error', jsonErrors.join(msg('and'))));
		}
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
