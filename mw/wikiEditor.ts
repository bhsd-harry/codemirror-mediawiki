/**
 * 添加WikiEditor工具栏
 * @param $textarea 文本框
 */
export const wikiEditor = async ($textarea: JQuery<HTMLTextAreaElement>): Promise<void> => {
	if (!mw.loader.getState('ext.wikiEditor')) {
		throw new Error('no-wikiEditor');
	}
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
	await new Promise(resolve => { // MW >= 1.21
		$textarea.on('wikiEditor-toolbar-doneInitialSections', resolve);
	});
};
