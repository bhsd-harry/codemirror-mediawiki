declare const $VERSION: string;

export const enum RuleState {
	off = '0',
	error = '1',
	on = '2',
}

export const curVersion = $VERSION,
	languageFallbacks = (async () => {
		await mw.loader.using('mediawiki.language');
		return mw.language.getFallbackLanguageChain();
	})(),
	indentKey = 'codemirror-mediawiki-indent',
	themeKey = 'codemirror-mediawiki-theme',
	preferenceId = 'cm-preference';
