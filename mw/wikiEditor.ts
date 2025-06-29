import {indentMore, indentLess} from '@codemirror/commands';
import {gotoLine, openSearchPanel} from '@codemirror/search';
import {msg} from './msg';
import {getInstance} from './textSelection';
import type {Command} from '@codemirror/view';
import type {CodeMirror} from './codemirror';

declare type Action<T = CodeMirror> = (ctx: WikiEditorContext, cm: T) => void;
declare type GroupName = '' | 'format' | 'more' | 'search';

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
		$toolbar.find(getGroup(['format', 'more'])).toggle(active);
		$toolbar.find('.group-codeeditor-main').toggle(active === undefined ? undefined : !active);
	}
};

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
	await Promise.all([
		mw.loader.using([
			'ext.wikiEditor',
			'oojs-ui.styles.icons-interactions',
			...hasCodeEditor ? ['ext.codeEditor.icons'] : ['oojs-ui.styles.icons-editing-list'],
		]),
		hasCodeEditor
			? new mw.Api().loadMessagesIfMissing([
				'codeeditor-indent',
				'codeeditor-outdent',
				'codeeditor-invisibleChars-toggle',
				'codeeditor-lineWrapping-toggle',
				'codeeditor-gotoline',
			])
			: false,
	]);
	if (context) {
		/** @todo 萌娘百科小工具更新后删除 */
		context.modules.toolbar.$toolbar.find('.group-insert>.tool:not([rel])').hide();
	} else if (typeof mw.addWikiEditor === 'function') { // MW >= 1.34
		mw.addWikiEditor($textarea);
	} else { // MW <= 1.33
		const {wikiEditor: {modules: {dialogs: {config}}}} = $;
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
			'codemirror6-format': {
				tools: {
					indent: getTool(
						'indent',
						[indentMore, 'editor.action.indentLines'],
						hasCodeEditor ? mw.msg('codeeditor-indent') : 'Indent',
					),
					outdent: getTool(
						'outdent',
						[indentLess, 'editor.action.outdentLines'],
						hasCodeEditor ? mw.msg('codeeditor-outdent') : 'Outdent',
					),
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
								mw.msg('codeeditor-invisibleChars-toggle'),
							),
							lineWrapping: getTool(
								'wrapping',
								(_, cm) => {
									const state = !isActive($toolbar, 'lineWrapping');
									cm.setLineWrapping(state);
									toggleButton($toolbar, 'lineWrapping', state);
								},
								mw.msg('codeeditor-lineWrapping-toggle'),
							),
							gotoLine: getTool(
								'gotoLine',
								[gotoLine, 'editor.action.gotoLine'],
								mw.msg('codeeditor-gotoline'),
							),
						}
						: {},
					preferences: getTool(
						'settings',
						() => {
							document.getElementById('cm-settings')!.click();
						},
						msg('title'),
					),
				},
			},
			'codemirror6-search': {
				tools: {
					cmSearch: getTool(
						'articleSearch',
						[
							openSearchPanel,
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
	});
	setActive($toolbar, true);
	$toolbar.toggleClass('codemirror-readonly', readOnly)
		.toggleClass('codemirror-wiki', isWiki)
		.toggleClass('codemirror-coding', !isWiki);
};
