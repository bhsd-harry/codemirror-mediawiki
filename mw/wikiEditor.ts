import {indentMore, indentLess} from '@codemirror/commands';
import {gotoLine} from '@codemirror/search';
import {msg} from './msg';
import {instances} from './textSelection';
import type {CodeMirror} from './codemirror';

export interface WikiEditorContext {
	modules: {
		toolbar: {$toolbar: JQuery};
	};
}

/**
 * 查找WikiEditor工具栏按钮
 * @param $toolbar WikiEditor工具栏
 * @param name 按钮名称
 * @param children 是否包含子元素
 */
function findButton($toolbar: JQuery, name: string, children?: boolean): JQuery;
function findButton($toolbar: JQuery | undefined, name: string, children?: boolean): JQuery | undefined;
function findButton($toolbar: JQuery | undefined, name: string, children?: boolean): JQuery | undefined {
	const $button = $toolbar
		?.find(`.group-codemirror6${name === 'toggle' ? '' : '-more'}>[rel=${name}]`);
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
 * @param context WikiEditor context
 * @param active 是否激活
 */
const setActive = (context: WikiEditorContext, active?: true): void => {
	const {$toolbar} = context.modules.toolbar;
	toggleButton($toolbar, 'toggle', active);
	$toolbar.find('.group-codemirror6-format,.group-codemirror6-more').toggle(active);
};

/**
 * 创建工具栏按钮
 * @returns CodeMirror 6工具
 * @param oouiIcon OOUI图标名称
 * @param execute 执行函数
 * @param label 按钮标签
 */
const getTool = (oouiIcon: string, execute: (ctx: WikiEditorContext) => void, label?: string): object => ({
	type: 'button',
	oouiIcon,
	label,
	action: {
		type: 'callback',
		execute,
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
	});
	await mw.loader.using(['ext.wikiEditor', 'oojs-ui.styles.icons-interactions', 'ext.codeEditor.icons']);
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
						(ctx: WikiEditorContext) => {
							($textarea.data('CodeMirror6') as CodeMirror | undefined)?.toggle();
							setActive(ctx);
						},
						'CodeMirror 6',
					),
				},
			},
			'codemirror6-format': {
				tools: {
					indent: getTool(
						'indent',
						() => {
							const cm = instances.get($textarea[0]!)!;
							if (cm.view) {
								indentMore(cm.view);
							} else if (cm.editor) {
								cm.editor.trigger(
									'wikiEditor',
									'editor.action.indentLines',
									undefined,
								);
							}
						},
					),
					outdent: getTool(
						'outdent',
						() => {
							const cm = instances.get($textarea[0]!)!;
							if (cm.view) {
								indentLess(cm.view);
							} else if (cm.editor) {
								cm.editor.trigger(
									'wikiEditor',
									'editor.action.outdentLines',
									undefined,
								);
							}
						},
					),
				},
			},
			'codemirror6-more': {
				tools: {
					invisibleChars: getTool(
						'pilcrow',
						() => {
							const state = !isActive($toolbar, 'invisibleChars');
							instances.get($textarea[0]!)!.prefer({
								highlightSpecialChars: state,
								highlightWhitespace: state,
							});
						},
					),
					lineWrapping: getTool(
						'wrapping',
						() => {
							const state = !isActive($toolbar, 'lineWrapping');
							instances.get($textarea[0]!)!.setLineWrapping(state);
							toggleButton($toolbar, 'lineWrapping', state);
						},
					),
					gotoLine: getTool(
						'gotoLine',
						() => {
							const cm = instances.get($textarea[0]!)!;
							if (cm.view) {
								gotoLine(cm.view);
							} else if (cm.editor) {
								cm.editor.trigger(
									'wikiEditor',
									'editor.action.gotoLine',
									undefined,
								);
							}
						},
					),
					preferences: getTool(
						'settings',
						() => {
							document.getElementById('cm-settings')!.click();
						},
						msg('title'),
					),
				},
			},
		},
	});
	setActive(context, true);
	$toolbar.toggleClass('codemirror-readonly', readOnly)
		.toggleClass('codemirror-coding', !isWiki);
};
