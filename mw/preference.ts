import {rules} from 'wikiparser-node/dist/base.mjs';
import {getObject, setObject} from '@bhsd/browser';
import {isWMFSite} from '../src/mediawiki';
import {CodeMirror} from './codemirror';
import {msg, parseMsg, i18n} from './msg';
import {instances} from './textSelection';
import {parsoidRules} from './lintsource';
import type {LintError} from 'wikiparser-node';
import type {ApiEditPageParams, ApiQueryRevisionsParams} from 'types-mediawiki-api';

declare type codeKey = typeof codeKeys[number];

declare type Preferences = {
	addons: string[];
	useMonaco: string[];
	indent: string;
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

const storageKey = 'codemirror-mediawiki-addons',
	monacoKey = 'codemirror-mediawiki-monaco',
	langs = ['wiki', 'javascript', 'css', 'lua', 'json', 'vue'],
	labels = ['Wikitext', 'JavaScript', 'CSS', 'Lua', 'JSON', 'Vue'],
	wikilintKey = 'codemirror-mediawiki-wikilint',
	codeKeys = ['ESLint', 'Stylelint'] as const,
	user = mw.config.get('wgUserGroups')?.includes('user')
		&& mw.config.get('wgUserName'),
	userPage = user ? `User:${user}/codemirror-mediawiki.json` : undefined;

export const enum RuleState {
	off = '0',
	error = '1',
	on = '2',
}

export const indentKey = 'codemirror-mediawiki-indent',
	themeKey = 'codemirror-mediawiki-theme',
	prefs = new Set(getObject(storageKey) as string[] | null),
	useMonaco = new Set(getObject(monacoKey) as string[] | null ?? (prefs.has('useMonaco') ? langs : [])),
	wikilint = (getObject(wikilintKey) ?? {}) as Record<string, RuleState | undefined>,
	wikilintWidgets = new Map<string, OO.ui.DropdownInputWidget>(),
	panelLinter: {$element?: JQuery} = {},
	codeConfigs = new Map(codeKeys.map(k => [k, getObject(`codemirror-mediawiki-${k}`)]));

// OOUI组件
let dialog: OO.ui.MessageDialog | undefined,
	layout: OO.ui.IndexLayout,
	widget: OO.ui.CheckboxMultiselectInputWidget,
	monacoWidget: OO.ui.CheckboxMultiselectInputWidget,
	indentWidget: OO.ui.TextInputWidget,
	themeWidget: OO.ui.DropdownInputWidget,
	indent = localStorage.getItem(indentKey) ?? '',
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
	(await api)!.get(params).then( // eslint-disable-line promise/prefer-await-to-then
		res => {
			const {query: {pages: [page]}} = res as MediaWikiResponse;
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
				for (const option of json.useMonaco ?? (prefs.has('useMonaco') ? langs : [])) {
					useMonaco.add(option);
				}
				if (json.indent) {
					localStorage.setItem(indentKey, json.indent);
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

export const buildWidgets = (ruleArr: readonly string[]): JQuery[] => {
	if (ruleArr.length === 0) {
		return [];
	}
	const isWikiLint = ruleArr === rules,
		defaultSeverity = isWikiLint ? RuleState.error : RuleState.on;
	return [
		...isWMFSite() ? [$('<h2>', {text: isWikiLint ? 'WikiLint' : 'Parsoid'})] : [],
		...ruleArr.map(label => {
			const state = label === 'no-arg' ? RuleState.off : defaultSeverity,
				dropdown = new OO.ui.DropdownInputWidget({
					options: [
						{data: RuleState.off, label: msg('wikilint-off')},
						...isWikiLint ? [{data: RuleState.error, label: msg('wikilint-error')}] : [],
						{data: RuleState.on, label: msg('wikilint-on')},
					],
					value: wikilint[label] ?? state,
				}),
				text = isWikiLint ? label : label.slice(8),
				f = new OO.ui.FieldLayout(dropdown, {
					label: $('<a>', {
						text,
						href: isWikiLint
							? `https://github.com/bhsd-harry/wikiparser-node/wiki/${text}`
							: `https://www.mediawiki.org/wiki/Help:Lint_errors/${text}`,
						target: '_blank',
					}),
				});
			wikilintWidgets.set(label, dropdown);
			wikilint[label] ??= state;
			return f.$element;
		}),
	];
};

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
		monacoWidget.setValue([...useMonaco] as unknown as string);
		indentWidget.setValue(indent);
		themeWidget.setValue(theme);
	} else {
		dialog = new OO.ui.MessageDialog({id: 'cm-preference'});
		dialog.$element.css('z-index', 801);
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
		layout.addTabPanels([panelMain, panelWikilint, ...Object.values(panels)], 0);
		widget = new OO.ui.CheckboxMultiselectInputWidget({
			options: [
				{disabled: true},
				...Object.keys(i18n)
					.filter(
						k =>
							k !== 'addon-indent'
							&& k !== 'addon-theme'
							&& k !== 'addon-useMonaco'
							&& k.startsWith('addon-')
							&& !k.endsWith('-mac'),
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
			options: langs.map((lang, i): Pick<OO.ui.MultioptionWidget.ConfigOptions, 'data' | 'label'> => ({
				data: lang,
				label: labels[i]!,
			})),
			value: [...useMonaco] as unknown as string,
		});
		indentWidget = new OO.ui.TextInputWidget({value: indent, placeholder: String.raw`\t`});
		themeWidget = new OO.ui.DropdownInputWidget({
			value: theme,
			options: [
				{data: 'auto', label: msg('theme-auto')},
				{data: 'light', label: 'light'},
				{data: 'dark', label: 'dark'},
				{data: 'nord', label: 'nord'},
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
			themeField = new OO.ui.FieldLayout(themeWidget, {label: msg('addon-theme')});
		panelMain.$element.append(
			field.$element,
			indentField.$element,
			themeField.$element,
			monacoField.$element,
			$('<p>', {html: msg('feedback', 'codemirror-mediawiki')}),
		);
		panelWikilint.$element.append(
			...buildWidgets(rules),
			$('<p>', {html: msg('feedback', 'wikiparser-node')}),
			...buildWidgets(parsoidRules),
		);
		panelLinter.$element = panelWikilint.$element;
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
			oldTheme = theme,
			save = prefs.has('save');
		indent = indentWidget.getValue(); // eslint-disable-line require-atomic-updates
		let changed = indent !== oldIndent;
		if (changed) {
			for (const cm of editors) {
				cm?.setIndent(indent || '\t');
			}
			localStorage.setItem(indentKey, indent);
		}

		// 主题
		theme = themeWidget.getValue(); // eslint-disable-line require-atomic-updates
		if (theme !== oldTheme) {
			changed = true;
			for (const cm of editors) {
				cm?.setTheme(theme);
			}
			localStorage.setItem(themeKey, theme);
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
		prefs.delete('useMonaco');
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
		if (useMonaco.size > 0) {
			prefs.add('useMonaco');
		}
		value = [...prefs];
		setObject(storageKey, value);

		// 保存至用户子页面
		if (changed && user && (save || prefs.has('save'))) {
			const params: ApiEditPageParams = {
				action: 'edit',
				title: userPage!,
				text: JSON.stringify({
					addons: value,
					useMonaco: [...useMonaco],
					indent,
					theme,
					wikilint,
					ESLint: codeConfigs.get('ESLint'),
					Stylelint: codeConfigs.get('Stylelint'),
				} as Preferences),
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
};
