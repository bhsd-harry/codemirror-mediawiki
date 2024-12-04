import {msg} from './msg';
import type {CodeMirror} from './base';

declare interface WikiEditorContext {
	modules: {
		toolbar: {$toolbar: JQuery};
	};
}

const setActive = ({modules: {toolbar: {$toolbar}}}: WikiEditorContext): void => {
	$toolbar.find('.group-codemirror6>[rel=CodeMirror]').children().addBack().toggleClass('tool-active');
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
							CodeMirror: {
								type: 'button',
								oouiIcon: 'highlight',
								action: {
									type: 'callback',
									execute(context: WikiEditorContext) {
										($textarea.data('CodeMirror6') as CodeMirror | undefined)?.toggle();
										setActive(context);
									},
								},
							},
							CodeMirrorPreferences: {
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
			setActive($textarea.data('wikiEditorContext') as WikiEditorContext);
			resolve();
		});
	});
	await mw.loader.using('ext.wikiEditor');
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
