import {rules} from 'wikiparser-node/dist/base.mjs';
import {getObject, setObject} from '@bhsd/browser';
import {CodeMirror} from './codemirror';
import {preferenceId, indentKey, colKey, themeKey, RuleState, linterHook} from './constants';
import {parsoidRules} from './lintsource';
import {msg, parseMsg, i18n} from './msg';
import {instances} from './util';
import type {LintError} from 'wikiparser-node';
import type {ApiEditPageParams, ApiQueryRevisionsParams} from 'types-mediawiki-api';

declare type codeKey = typeof codeKeys[number];

declare type Preferences = {
	addons: string[];
	useMonaco: string[];
	indent: string;
	col: number;
	theme: string;
	wikilint: Record<LintError.Rule, RuleState>;
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

const prefKey = 'codemirror-mediawiki-addons',
	monacoKey = 'codemirror-mediawiki-monaco',
	nonBooleanKeys = new Set(['indent', 'col', 'theme', 'useMonaco'].map(k => `addon-${k}`)),
	labels = ['Wikitext', 'JavaScript', 'CSS', 'Lua', 'JSON', 'Vue'],
	wikilintKey = 'codemirror-mediawiki-wikilint',
	codeKeys = ['ESLint', 'Stylelint', 'Luacheck'] as const,
	hook = mw.hook<string[]>(linterHook),
	user = mw.config.get('wgUserGroups')?.includes('user')
		&& mw.config.get('wgUserName'),
	userPage = user ? `User:${user}/codemirror-mediawiki.json` : undefined;

export const prefs = new Set(getObject(prefKey) as string[] | null),
	useMonaco = new Set(getObject(monacoKey) as string[] | null),
	wikilint = (getObject(wikilintKey) ?? {}) as Record<string, RuleState | undefined>,
	wikilintWidgets = new Map<string, OO.ui.DropdownInputWidget>(),
	preferenceDialog: {layout?: OO.ui.IndexLayout} = {},
	codeConfigs = new Map(codeKeys.map(k => [k, getObject(`codemirror-mediawiki-${k}`)]));

// OOUI组件
let dialog: OO.ui.MessageDialog | undefined,
	widget: OO.ui.CheckboxMultiselectInputWidget,
	monacoWidget: OO.ui.CheckboxMultiselectInputWidget,
	indentWidget: OO.ui.TextInputWidget,
	colWidget: OO.ui.NumberInputWidget,
	themeWidget: OO.ui.DropdownInputWidget,
	indent = localStorage.getItem(indentKey) ?? '',
	col = Number(localStorage.getItem(colKey)) || 0,
	theme = localStorage.getItem(themeKey) ?? 'auto';
const widgets: Partial<Record<codeKey, OO.ui.MultilineTextInputWidget>> = {};

/**
 * 处理Api请求错误
 * @param code 错误代码
 * @param e 错误信息
 */
const apiErr = (code: string, e: any): void => { // eslint-disable-line @typescript-eslint/no-explicit-any
	const message = code === 'http' || code === 'okay-but-empty'
		? `MediaWiki API request failed: ${code}`
		: $('<ul>', {html: (e as {errors: {html: string}[]}).errors.map(({html}) => $('<li>', {html}))});
	void mw.notify(message, {type: 'error', autoHideSeconds: 'long'});
};

const api = (async () => {
	if (user) {
		await mw.loader.using('mediawiki.api');
		return new mw.Api({parameters: {errorformat: 'html', formatversion: 2}});
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
	(await api)!.get(params).then( // eslint-disable-line promise/prefer-await-to-then
		res => {
			const [page] = (res as MediaWikiResponse).query.pages;
			if (page?.revisions) {
				const json: Partial<Preferences> = JSON.parse(page.revisions[0]!.content);
				if (!json.addons?.includes('save')) {
					return;
				}
				prefs.clear();
				for (const option of json.addons) {
					prefs.add(option);
				}
				useMonaco.clear();
				for (const option of json.useMonaco ?? []) {
					useMonaco.add(option);
				}
				if (json.indent) {
					localStorage.setItem(indentKey, json.indent);
				}
				if (json.col !== undefined) {
					localStorage.setItem(colKey, String(json.col));
				}
				if (json.theme) {
					localStorage.setItem(themeKey, json.theme);
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

export const buildPanel = (label: string, ruleArr: readonly string[]): OO.ui.TabPanelLayout[] => {
	if (ruleArr.length === 0) {
		return [];
	}
	const panel = new OO.ui.TabPanelLayout(label.toLowerCase(), {label}),
		isWikiLint = label === 'WikiLint',
		defaultSeverity = isWikiLint ? RuleState.error : RuleState.on;
	panel.$element.append(
		...ruleArr.filter(rule => rule !== 'invalid-math').map(rule => {
			const state = rule === 'no-arg' ? RuleState.off : defaultSeverity,
				dropdown = new OO.ui.DropdownInputWidget({
					options: [
						{data: RuleState.off, label: msg('wikilint-off')},
						...isWikiLint ? [{data: RuleState.error, label: msg('wikilint-error')}] : [],
						{data: RuleState.on, label: msg('wikilint-on')},
					],
					value: wikilint[rule] ?? state,
				}),
				text = isWikiLint ? rule : rule.slice(8),
				f = new OO.ui.FieldLayout(dropdown, {
					label: $('<a>', {
						text,
						href: isWikiLint
							? `https://github.com/bhsd-harry/wikiparser-node/wiki/${text}`
							: `https://www.mediawiki.org/wiki/Help:Lint_errors/${text}`,
						target: '_blank',
						rel: 'noopener noreferrer nofollow',
					}),
				});
			wikilintWidgets.set(rule, dropdown);
			wikilint[rule] ??= state;
			return f.$element;
		}),
	);
	return [panel];
};

/** 打开设置对话框 */
export const openPreference = async (): Promise<void> => {
	await mw.loader.using([
		'oojs-ui-windows',
		'oojs-ui-widgets',
		'oojs-ui.styles.icons-content',
		'mediawiki.jqueryMsg',
	]);
	await loadJSON;
	if (dialog) {
		widget.setValue([...prefs] as unknown as string);
		monacoWidget.setValue([...useMonaco] as unknown as string);
		indentWidget.setValue(indent);
		colWidget.setValue(String(col));
		/** @todo 一段时间后移除对过时选项`nord`的支持 */
		themeWidget.setValue(theme === 'nord' ? 'dark' : theme);
	} else {
		dialog = new OO.ui.MessageDialog({id: preferenceId});
		dialog.$element.css('z-index', 1002);
		const windowManager = new OO.ui.WindowManager();
		windowManager.$element.appendTo(document.body);
		windowManager.addWindows([dialog]);
		preferenceDialog.layout = new OO.ui.IndexLayout();
		const panelMain = new OO.ui.TabPanelLayout('main', {label: msg('title')}),
			panelWikilint = buildPanel('WikiLint', rules),
			panelParsoid = buildPanel('Parsoid', [...parsoidRules, 'parsoid-template-data']),
			panels: Partial<Record<codeKey, OO.ui.TabPanelLayout>> = {};
		for (const label of codeKeys) {
			const c = codeConfigs.get(label);
			widgets[label] = new OO.ui.MultilineTextInputWidget({
				value: c ? JSON.stringify(c, null, indent || '\t') : '',
			});
			const codeField = new OO.ui.FieldLayout(widgets[label], {label: msg(`${label}-config`), align: 'top'}),
				panel = new OO.ui.TabPanelLayout(label, {label, $content: codeField.$element});
			panel.on('active', active => {
				const [textarea] = panel.$element.find(
					'textarea',
				) as unknown as [HTMLTextAreaElement];
				if (active && !instances.has(textarea)) {
					(async () => {
						const {view, editor} = await CodeMirror.fromTextArea(textarea, 'json');
						if (view) {
							view.dom.style.removeProperty('height');
						}
						if (editor) {
							editor.getContainerDomNode().style.height = `${Math.max(editor.getContentHeight(), 400)}px`;
						}
					})();
				}
			});
			panels[label] = panel;
		}
		preferenceDialog.layout.addTabPanels(
			[panelMain, ...panelWikilint, ...panelParsoid, ...Object.values(panels)],
			0,
		);
		widget = new OO.ui.CheckboxMultiselectInputWidget({
			options: [
				{disabled: true},
				...Object.keys(i18n)
					.filter(
						k => k.startsWith('addon-')
							&& !k.endsWith('-mac')
							&& !nonBooleanKeys.has(k),
					)
					.map((k): Pick<OO.ui.MultioptionWidget.ConfigOptions, 'data' | 'label' | 'disabled'> => ({
						data: k.slice(6),
						label: parseMsg(k),
						disabled: k === 'addon-wikiEditor' && !mw.loader.getState('ext.wikiEditor')
							|| k === 'addon-save' && !user,
					})),
			],
			value: [...prefs] as unknown as string,
		});
		monacoWidget = new OO.ui.CheckboxMultiselectInputWidget({
			options: ['wiki', 'javascript', 'css', 'lua', 'json', 'vue']
				.map((lang, i): Pick<OO.ui.MultioptionWidget.ConfigOptions, 'data' | 'label'> => ({
					data: lang,
					label: labels[i]!,
				})),
			value: [...useMonaco] as unknown as string,
		});
		indentWidget = new OO.ui.TextInputWidget({value: indent, placeholder: String.raw`\t`});
		colWidget = new OO.ui.NumberInputWidget({value: String(col), min: 0});
		themeWidget = new OO.ui.DropdownInputWidget({
			value: theme,
			options: [
				{data: 'auto', label: msg('theme-auto')},
				{data: 'light', label: 'light'},
				{data: 'dark', label: 'dark'},
			],
		});
		const field = new OO.ui.FieldLayout(widget, {
				label: msg('label'),
				align: 'top',
			}),
			monacoField = new OO.ui.FieldLayout(monacoWidget, {
				label: msg('addon-useMonaco'),
				align: 'top',
			}),
			indentField = new OO.ui.FieldLayout(indentWidget, {label: msg('addon-indent')}),
			colField = new OO.ui.FieldLayout(colWidget as unknown as OO.ui.Widget, {label: msg('addon-col')}),
			themeField = new OO.ui.FieldLayout(themeWidget, {label: msg('addon-theme')});
		panelMain.$element.append(
			field.$element,
			indentField.$element,
			colField.$element,
			themeField.$element,
			monacoField.$element,
			$('<p>', {html: msg('feedback', 'codemirror-mediawiki')}),
		);
		panelWikilint[0]!.$element.append($('<p>', {html: msg('feedback', 'wikiparser-node')}));
	}

	const data = await (dialog.open({
		message: preferenceDialog.layout!.$element,
		actions: [
			{action: 'reject', label: mw.msg('ooui-dialog-message-reject')},
			{action: 'accept', label: mw.msg('ooui-dialog-message-accept'), flags: 'progressive'},
		],
		size: 'medium',
	}).closing as PromiseLike<{action?: unknown} | undefined>);
	if (typeof data === 'object' && data.action === 'accept') {
		// 缩进
		const oldIndent = indent,
			oldCol = col,
			oldTheme = theme,
			save = prefs.has('save'),
			editors = [
				...document
					.querySelectorAll<HTMLTextAreaElement>('.cm-editor+textarea,.monaco-container+textarea'),
			].map(textarea => instances.get(textarea));
		indent = indentWidget.getValue();
		let changed = indent !== oldIndent;
		if (changed) {
			for (const cm of editors) {
				cm?.setIndent(indent);
			}
			localStorage.setItem(indentKey, indent);
		}
		col = Number(colWidget.getValue());
		if (col !== oldCol) {
			changed = true;
			for (const cm of editors) {
				cm?.setColumnGuide(col);
			}
			localStorage.setItem(colKey, String(col));
		}

		// 主题
		theme = themeWidget.getValue();
		if (theme !== oldTheme) {
			changed = true;
			for (const cm of editors) {
				cm?.setTheme(theme);
			}
			localStorage.setItem(themeKey, theme);
		}

		// WikiLint
		let wikilintConfigured = false;
		for (const [rule, dropdown] of wikilintWidgets) {
			const val = dropdown.getValue() as RuleState,
				configured = val !== wikilint[rule];
			changed ||= configured;
			wikilintConfigured ||= configured;
			wikilint[rule] = val;
		}
		setObject(wikilintKey, wikilint);
		if (wikilintConfigured) {
			hook.fire('WikiLint');
		}

		// ESLint & Stylelint
		const jsonErrors: string[] = [];
		for (const key of codeKeys) {
			try {
				const config = JSON.parse(widgets[key]!.getValue().trim() || 'null'),
					configured = JSON.stringify(config) !== JSON.stringify(codeConfigs.get(key));
				changed ||= configured;
				codeConfigs.set(key, config);
				setObject(`codemirror-mediawiki-${key}`, config);
				if (configured) {
					hook.fire(key);
				}
			} catch {
				jsonErrors.push(key);
			}
		}
		if (jsonErrors.length > 0) {
			void OO.ui.alert(msg('json-error', jsonErrors.join(msg('and'))));
		}

		// Monaco
		let value = monacoWidget.getValue() as unknown as string[];
		if (value.length !== useMonaco.size || !value.every(option => useMonaco.has(option))) {
			changed = true;
			useMonaco.clear();
			for (const option of value) {
				useMonaco.add(option);
			}
			setObject(monacoKey, value);
		}

		// 插件
		value = widget.getValue() as unknown as string[];
		if (value.length !== prefs.size || !value.every(option => prefs.has(option))) {
			changed = true;
			prefs.clear();
			for (const option of value) {
				prefs.add(option);
			}
			for (const cm of editors) {
				cm?.prefer(value);
			}
		}
		value = [...prefs];
		setObject(prefKey, value);

		if (changed) {
			// 更新语法诊断
			if (prefs.has('lint')) {
				for (const cm of editors) {
					cm?.update();
				}
			}

			// 保存至用户子页面
			if (user && (save || prefs.has('save'))) {
				const params: ApiEditPageParams = {
					action: 'edit',
					title: userPage!,
					text: JSON.stringify({
						addons: value,
						useMonaco: [...useMonaco],
						indent,
						col,
						theme,
						wikilint: wikilint as Record<LintError.Rule, RuleState>,
						ESLint: codeConfigs.get('ESLint'),
						Stylelint: codeConfigs.get('Stylelint'),
						Luacheck: codeConfigs.get('Luacheck'),
					} satisfies Preferences),
					summary: msg('save-summary'),
				};
				// eslint-disable-next-line promise/prefer-await-to-then
				(await api)!.postWithToken('csrf', params).then(
					() => {
						void mw.notify(parseMsg('save-success'), {type: 'success'});
					},
					apiErr,
				);
			}
		}
	}
};
