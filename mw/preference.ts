import {rules} from 'wikiparser-node/base';
import {CodeMirror} from './base';
import {getObject, setObject} from './util';
import {msg, parseMsg, i18n} from './msg';
import {instances} from './textSelection';
import type {LintError} from 'wikiparser-node';
import type {ApiEditPageParams, ApiQueryRevisionsParams} from 'types-mediawiki/api_params';

const storageKey = 'codemirror-mediawiki-addons',
	wikilintKey = 'codemirror-mediawiki-wikilint',
	codeKeys = ['ESLint', 'Stylelint'] as const,
	user = mw.config.get('wgUserName'),
	userPage = user && `User:${user}/codemirror-mediawiki.json`;

declare type codeKey = typeof codeKeys[number];

declare type Preferences = {
	addons?: string[];
	indent?: string;
	wikilint?: Record<LintError.Rule, RuleState>;
} & Record<codeKey, unknown>;

declare interface MediaWikiPage {
	readonly revisions?: {
		readonly content: string;
	}[];
}
declare interface MediaWikiResponse {
	readonly query: {
		readonly pages: MediaWikiPage[];
	};
}

const enum RuleState {
	off = '0',
	error = '1',
	on = '2',
}

export const indentKey = 'codemirror-mediawiki-indent',
	prefs = new Set(getObject(storageKey) as string[] | null),
	wikilint = (getObject(wikilintKey) || {}) as Record<LintError.Rule, RuleState | undefined>,
	codeConfigs = new Map(codeKeys.map(k => [k, getObject(`codemirror-mediawiki-${k}`)]));

// OOUI组件
let dialog: OO.ui.MessageDialog | undefined,
	layout: OO.ui.IndexLayout,
	widget: OO.ui.CheckboxMultiselectInputWidget,
	indentWidget: OO.ui.TextInputWidget,
	indent = localStorage.getItem(indentKey) || '';
const widgets: Partial<Record<codeKey, OO.ui.MultilineTextInputWidget>> = {},
	wikilintWidgets = new Map<LintError.Rule, OO.ui.DropdownInputWidget>();

/**
 * 处理Api请求错误
 * @param code 错误代码
 * @param e 错误信息
 */
const apiErr = (code: string, e: any): void => { // eslint-disable-line @typescript-eslint/no-explicit-any
	const message = code === 'http' || code === 'okay-but-empty'
		? `MediaWiki API request failed: ${code}`
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		: $('<ul>', {html: (e.errors as {html: string}[]).map(({html}) => $('<li>', {html}))});
	void mw.notify(message as string | HTMLElement[], {type: 'error', autoHideSeconds: 'long'});
};

const api = (async () => {
	if (user) {
		await mw.loader.using('mediawiki.api');
		return new mw.Api({parameters: {errorformat: 'html', formatversion: '2'}});
	}
	return undefined;
})();

export const loadJSON = (async () => {
	if (!user) {
		return;
	}
	const params: ApiQueryRevisionsParams = {
		action: 'query',
		prop: 'revisions',
		titles: userPage!,
		rvprop: 'content',
		rvlimit: 1,
	};
	(await api)!.get(params as Record<string, string>).then( // eslint-disable-line promise/prefer-await-to-then
		res => {
			const {query: {pages: [page]}} = res as MediaWikiResponse;
			if (page?.revisions) {
				const json: Preferences = JSON.parse(page.revisions[0]!.content);
				if (!json.addons?.includes('save')) {
					return;
				}
				prefs.clear();
				for (const option of json.addons) {
					prefs.add(option);
				}
				if (json.indent) {
					localStorage.setItem(indentKey, json.indent);
				}
				for (const key of codeKeys) {
					if (json[key]) {
						codeConfigs.set(key, json[key]);
					}
				}
				if (json.wikilint) {
					Object.assign(wikilint, json.wikilint);
				}
			}
		},
		apiErr,
	);
})();

/**
 * 打开设置对话框
 * @param editors CodeMirror实例
 */
export const openPreference = async (editors: (CodeMirror | undefined)[]): Promise<void> => {
	await mw.loader.using([
		'oojs-ui-windows',
		'oojs-ui-widgets',
		'oojs-ui.styles.icons-content',
		'mediawiki.jqueryMsg',
	]);
	await loadJSON;
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
		for (const label of codeKeys) {
			const c = codeConfigs.get(label);
			widgets[label] = new OO.ui.MultilineTextInputWidget({
				value: c ? JSON.stringify(c, null, indent || '\t') : '',
			});
			const codeField = new OO.ui.FieldLayout(widgets[label], {label: msg(`${label}-config`), align: 'top'}),
				panel = new OO.ui.TabPanelLayout(label, {label, $content: codeField.$element});
			panel.on('active', active => {
				const [textarea] = panel.$element.find('textarea') as unknown as [HTMLTextAreaElement];
				if (active && !instances.has(textarea)) {
					(async () => {
						const {editor} = await CodeMirror.fromTextArea(textarea, 'json');
						if (editor) {
							editor.getContainerDomNode().style.height = `${Math.max(editor.getContentHeight(), 400)}px`;
						}
					})();
				}
			});
			panels[label] = panel;
		}
		layout.addTabPanels([panelMain, panelWikilint, ...Object.values(panels)], 0);
		widget = new OO.ui.CheckboxMultiselectInputWidget({
			options: [
				{disabled: true},
				...Object.keys(i18n)
					.filter(k => k !== 'addon-indent' && k.startsWith('addon-') && !k.endsWith('-mac'))
					.map(k => ({
						data: k.slice(6),
						label: parseMsg(k),
						disabled: k === 'addon-wikiEditor' && !mw.loader.getState('ext.wikiEditor')
						|| k === 'addon-save' && !user,
					})),
			],
			value: [...prefs] as unknown as string,
		});
		indentWidget = new OO.ui.TextInputWidget({value: indent, placeholder: String.raw`\t`});
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
			...rules.map(label => {
				const state = label === 'no-arg' ? RuleState.off : RuleState.error,
					dropdown = new OO.ui.DropdownInputWidget({
						options: [
							{data: RuleState.off, label: msg('wikilint-off')},
							{data: RuleState.error, label: msg('wikilint-error')},
							{data: RuleState.on, label: msg('wikilint-on')},
						],
						value: wikilint[label] || state,
					}),
					f = new OO.ui.FieldLayout(dropdown, {label});
				wikilintWidgets.set(label, dropdown);
				wikilint[label] ||= state;
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
		// 缩进
		const oldIndent = indent,
			save = prefs.has('save');
		indent = indentWidget.getValue(); // eslint-disable-line require-atomic-updates
		let changed = indent !== oldIndent;
		if (changed) {
			for (const cm of editors) {
				cm?.setIndent(indent || '\t');
			}
			localStorage.setItem(indentKey, indent);
		}

		// WikiLint
		for (const [rule, dropdown] of wikilintWidgets) {
			const val = dropdown.getValue() as RuleState;
			changed ||= val !== wikilint[rule];
			wikilint[rule] = val;
		}
		setObject(wikilintKey, wikilint);

		// ESLint & Stylelint
		const jsonErrors: string[] = [];
		for (const key of codeKeys) {
			try {
				const config = JSON.parse(widgets[key]!.getValue().trim() || 'null');
				changed ||= JSON.stringify(config) !== JSON.stringify(codeConfigs.get(key));
				codeConfigs.set(key, config);
				setObject(`codemirror-mediawiki-${key}`, config);
			} catch {
				jsonErrors.push(key);
			}
		}
		if (jsonErrors.length > 0) {
			void OO.ui.alert(msg('json-error', jsonErrors.join(msg('and'))));
		}

		// 插件
		const value = widget.getValue() as unknown as string[];
		if (value.length !== prefs.size || !value.every(option => prefs.has(option))) {
			changed = true;
			prefs.clear();
			for (const option of value) {
				prefs.add(option);
			}
			for (const cm of editors) {
				cm?.prefer(value);
			}
			setObject(storageKey, value);
		}

		// 保存至用户子页面
		if (changed && user && (save || prefs.has('save'))) {
			const params: ApiEditPageParams = {
				action: 'edit',
				title: userPage!,
				text: JSON.stringify({
					addons: [...prefs],
					indent,
					wikilint,
					ESLint: codeConfigs.get('ESLint'),
					Stylelint: codeConfigs.get('Stylelint'),
				} as Preferences),
				summary: msg('save-summary'),
			};
			// eslint-disable-next-line promise/prefer-await-to-then
			(await api)!.postWithToken('csrf', params as Record<string, string>).then(
				() => {
					void mw.notify(parseMsg('save-success'), {type: 'success'});
				},
				apiErr,
			);
		}
	}
};
