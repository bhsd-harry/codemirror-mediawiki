import {indentMore, indentLess} from '@codemirror/commands';
import {gotoLine, openSearchPanel, closeSearchPanel, searchPanelOpen} from '@codemirror/search';
import {foldRef, unfoldRef} from '../src/fold';
import {msg} from './msg';
import {getInstance} from './util';
import {openPreference} from './preference';
import type {Command} from '@codemirror/view';
import type {CodeMirror} from './codemirror';

declare type Action<T = CodeMirror> = (ctx: WikiEditorContext, cm: T) => void;
declare type GroupName = '' | 'format' | 'more' | 'search';

const messages = {
	'codeeditor-indent': 'Indent',
	'codeeditor-outdent': 'Outdent',
	'codeeditor-invisibleChars-toggle': 'Toggle invisible characters',
	'codeeditor-lineWrapping-toggle': 'Toggle line wrapping',
	'codeeditor-gotoline': 'Go to line number...',
	'codemirror-prefs-autocomplete': 'Enable autocompletion',
};

/**
 * 获取消息
 * @param key 消息键
 */
const msgFallback = (key: keyof typeof messages): string => mw.messages.exists(key) ? mw.msg(key) : messages[key];

/**
 * 查找WikiEditor工具栏按钮
 * @param $toolbar WikiEditor工具栏
 * @param name 按钮名称
 * @param children 是否包含子元素
 */
function findButton($toolbar: JQuery, name: string, children?: boolean): JQuery;
function findButton($toolbar: JQuery | undefined, name: string, children?: boolean): JQuery | undefined;
function findButton($toolbar: JQuery | undefined, name: string, children?: boolean): JQuery | undefined {
	const $button = $toolbar?.find(`${getGroup(name === 'toggle' ? '' : 'more')}>[rel=${name}]`);
	return children ? $button?.children().addBack() : $button;
}

/**
 * 判断WikiEditor工具栏按钮是否处于激活状态
 * @param $toolbar WikiEditor工具栏
 * @param name 按钮名称
 */
const isActive = ($toolbar: JQuery, name: string): boolean =>
	findButton($toolbar, name).hasClass('tool-active');

/**
 * 创建工具栏按钮
 * @returns CodeMirror 6工具
 * @param oouiIcon OOUI图标名称
 * @param execute 执行函数
 * @param label 按钮标签
 */
const getTool = (oouiIcon: string, execute: Action | [Command, string, Action<void>?], label: string): object => ({
	type: 'button',
	oouiIcon,
	label,
	action: {
		type: 'callback',
		execute(ctx: WikiEditorContext): void {
			const cm = getInstance(ctx.$textarea);
			if (typeof execute === 'function') {
				execute(ctx, cm);
				return;
			}
			const [cmd, handler, fallback] = execute;
			if (fallback && !cm.visible) {
				fallback(ctx);
			} else if (cm.view) {
				cmd(cm.view);
			} else if (cm.editor) {
				cm.editor.trigger('wikiEditor', handler, undefined);
			}
		},
	},
});

export const getGroup = (name: GroupName | GroupName[]): string => Array.isArray(name)
	? name.map(n => getGroup(n)).join()
	: `.group-codemirror6${name && `-${name}`}`;

/**
 * 切换WikiEditor工具栏按钮状态
 * @param $toolbar WikiEditor工具栏
 * @param name 按钮名称
 * @param toggle 是否激活
 */
export const toggleButton = ($toolbar: JQuery | undefined, name: string, toggle?: boolean): void => {
	findButton($toolbar, name, true)?.toggleClass('tool-active', toggle);
};

/**
 * 设置工具栏按钮状态
 * @param $toolbar WikiEditor工具栏
 * @param active 是否激活
 */
export const setActive = ($toolbar?: JQuery, active?: boolean): void => {
	if ($toolbar) {
		toggleButton($toolbar, 'toggle', active);
		$toolbar.find(getGroup(['', 'search'])).show();
		$toolbar.find(getGroup(['format', 'more'])).toggle(active);
		$toolbar.find('.group-codeeditor-main').toggle(active === undefined ? undefined : !active);
	}
};

/**
 * 添加WikiEditor工具栏
 * @param $textarea 文本框
 * @param readOnly 是否只读
 * @param isWiki 是否为维基文本
 */
export default async ($textarea: JQuery<HTMLTextAreaElement>, readOnly: boolean, isWiki: boolean): Promise<void> => {
	if (!mw.loader.getState('ext.wikiEditor')) {
		throw new Error('no-wikiEditor');
	}
	let context = $textarea.data('wikiEditorContext') as WikiEditorContext | undefined;
	const done = new Promise<void>(resolve => { // MW >= 1.21
			if (context) {
				resolve();
				return;
			}
			$textarea.on('wikiEditor-toolbar-doneInitialSections', () => {
				resolve();
			});
		}),
		hasCodeEditor = mw.loader.getState('ext.codeEditor') !== null;
	await mw.loader.using([
		'ext.wikiEditor',
		'oojs-ui.styles.icons-interactions',
		'oojs-ui.styles.icons-layout',
		...hasCodeEditor ? ['ext.codeEditor.icons', 'mediawiki.api'] : ['oojs-ui.styles.icons-editing-list'],
	]);
	if (hasCodeEditor) {
		try {
			await new mw.Api().loadMessagesIfMissing([
				'codeeditor-indent',
				'codeeditor-outdent',
				'codeeditor-invisibleChars-toggle',
				'codeeditor-lineWrapping-toggle',
				'codeeditor-gotoline',
				'codemirror-prefs-autocomplete',
			]);
		} catch {}
	}
	// `id="wpTextbox1"`的textarea可能由`ext.wikiEditor`直接添加工具栏
	context ??= $textarea.data('wikiEditorContext') as WikiEditorContext | undefined;
	if (context) {
		//
	} else if (typeof mw.addWikiEditor === 'function') { // MW >= 1.34
		mw.addWikiEditor($textarea);
	} else { // MW <= 1.33
		const {config} = $.wikiEditor.modules.dialogs;
		$textarea.wikiEditor('addModule', {
			...$.wikiEditor.modules.toolbar.config.getDefaultConfig(),
			...config.getDefaultConfig(),
		});
		config.replaceIcons($textarea);
	}
	await done;
	context ??= $textarea.data('wikiEditorContext') as WikiEditorContext;
	const {$toolbar} = context.modules.toolbar;
	$textarea.wikiEditor('addToToolbar', {
		section: 'main',
		groups: {
			codemirror6: {
				tools: {
					toggle: getTool(
						'highlight',
						(_, cm) => {
							cm.toggle();
						},
						'CodeMirror 6',
					),
				},
			},
			...readOnly || isWiki
				? {}
				: {
					'codemirror6-format': {
						tools: {
							indent: getTool(
								'indent',
								[indentMore, 'editor.action.indentLines'],
								msgFallback('codeeditor-indent'),
							),
							outdent: getTool(
								'outdent',
								[indentLess, 'editor.action.outdentLines'],
								msgFallback('codeeditor-outdent'),
							),
						},
					},
				},
			'codemirror6-more': {
				tools: {
					...hasCodeEditor
						? {
							invisibleChars: getTool(
								'pilcrow',
								(_, cm) => {
									const state = !isActive($toolbar, 'invisibleChars');
									cm.prefer({
										highlightSpecialChars: state,
										highlightWhitespace: state,
									});
								},
								msgFallback('codeeditor-invisibleChars-toggle'),
							),
							lineWrapping: getTool(
								'wrapping',
								(_, cm) => {
									const state = !isActive($toolbar, 'lineWrapping');
									cm.setLineWrapping(state);
								},
								msgFallback('codeeditor-lineWrapping-toggle'),
							),
							gotoLine: getTool(
								'gotoLine',
								[gotoLine, 'editor.action.gotoLine'],
								msgFallback('codeeditor-gotoline'),
							),
						}
						: {},
					autocomplete: getTool(
						'checkAll',
						(_, cm) => {
							const state = !isActive($toolbar, 'autocomplete');
							cm.prefer({autocompletion: state});
						},
						msgFallback('codemirror-prefs-autocomplete'),
					),
					...isWiki
						? {
							foldRef: getTool(
								'viewCompact',
								(_, {view}) => {
									if (!view) {
										return;
									}
									const button: OO.ui.ButtonWidget = findButton($toolbar, 'foldRef')
											.data('ooui'),
										isNormal = button.getIcon() === 'viewCompact';
									button.setIcon(isNormal ? 'viewDetails' : 'viewCompact');
									if (isNormal) {
										foldRef(view);
									} else {
										unfoldRef(view);
									}
								},
								msg('toolbar-fold-ref'),
							),
						}
						: {},
					preferences: getTool(
						'settings',
						() => {
							void openPreference();
						},
						msg('title'),
					),
				},
			},
			...isWiki
				? {}
				: {
					'codemirror6-search': {
						tools: {
							cmSearch: getTool(
								'articleSearch',
								[
									(view): boolean =>
										(searchPanelOpen(view.state) ? closeSearchPanel : openSearchPanel)(view),
									'editor.action.startFindReplaceAction',
									(ctx): void => {
										$.wikiEditor.modules.dialogs.api.openDialog(ctx, 'search-and-replace');
									},
								],
								mw.msg('wikieditor-toolbar-tool-replace'),
							),
						},
					},
				},
		},
	});
	setActive($toolbar, true);
	$toolbar.toggleClass('codemirror-readonly', readOnly)
		.toggleClass('codemirror-wiki', isWiki)
		.toggleClass('codemirror-coding', !isWiki);
};
