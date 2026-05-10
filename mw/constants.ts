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
	linterMap = new Map([
		['wikitext', 'WikiLint'],
		['javascript', 'ESLint'],
		['css', 'Stylelint'],
		['lua', 'Luacheck'],
	]),
	indentKey = 'codemirror-mediawiki-indent',
	colKey = 'codemirror-mediawiki-col',
	themeKey = 'codemirror-mediawiki-theme',
	hook = 'wiki-codemirror6',
	settingHook = `${hook}.setting`,
	linterHook = `${hook}.linter`,
	preferenceId = 'cm-preference';
