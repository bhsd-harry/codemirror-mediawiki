import {msg} from './msg';
import type {CodeMirror} from './base';

declare interface WikiEditorContext {
	modules: {
		toolbar: {$toolbar: JQuery};
	};
}

/**
 * 设置工具栏按钮状态
 * @param context WikiEditor context
 * @param active 是否激活
 */
const setActive = (context: WikiEditorContext, active?: true): void => {
	const $group = context.modules.toolbar.$toolbar.find('.group-codemirror6');
	$group.children('[rel=toggle]').children().addBack().toggleClass('tool-active', active);
	$group.children('[rel=preferences]').toggle(active);
};

/**
 * 添加WikiEditor工具栏
 * @param $textarea 文本框
 */
export default async ($textarea: JQuery<HTMLTextAreaElement>): Promise<void> => {
	if (!mw.loader.getState('ext.wikiEditor')) {
		throw new Error('no-wikiEditor');
	}
	const done = new Promise<void>(resolve => { // MW >= 1.21
		$textarea.on('wikiEditor-toolbar-doneInitialSections', () => {
			$textarea.wikiEditor('addToToolbar', {
				section: 'main',
				groups: {
					codemirror6: {
						tools: {
							toggle: {
								type: 'button',
								oouiIcon: 'highlight',
								label: 'CodeMirror 6',
								action: {
									type: 'callback',
									execute(context: WikiEditorContext) {
										($textarea.data('CodeMirror6') as CodeMirror | undefined)?.toggle();
										setActive(context);
									},
								},
							},
							preferences: {
								type: 'button',
								oouiIcon: 'settings',
								label: msg('title'),
								action: {
									type: 'callback',
									execute() {
										document.getElementById('cm-settings')!.click();
									},
								},
							},
						},
					},
				},
			});
			setActive($textarea.data('wikiEditorContext') as WikiEditorContext, true);
			resolve();
		});
	});
	await mw.loader.using(['ext.wikiEditor', 'oojs-ui.styles.icons-interactions']);
	if ($textarea.data('wikiEditorContext')) {
		return;
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
};
