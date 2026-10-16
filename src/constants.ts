import type {Completion} from '@codemirror/autocomplete';

export const baseData: Record<'CDN', string | undefined> = {CDN: undefined},
	extData: Record<string, Set<string>> = {},
	extCompletion: Record<string, Completion[]> = {},
	mwPrefix = 'cm-mw-',
	mwTag = 'mw-tag-',
	mwSelector = /* #__PURE__ */ (() => `.${mwPrefix}`)(),
	hoverSelector = '.cm-tooltip-hover-mw',
	diagnosticSelector = '.cm-diagnosticText-clickable',
	panelSelector = '.cm-panel',
	actionSelector = '.cm-diagnosticAction',
	bgDark = '#4c566a',
	matchingCls = 'cm-matchingBracket',
	nonmatchingCls = 'cm-nonmatchingBracket';

export const autocompleteNamespaces = {
	0: '',
	6: 'File:',
	8: 'MediaWiki:',
	10: 'Template:',
	274: 'Widget:',
	828: 'Module:',
};

export const isMac = /* #__PURE__ */ (() => {
	const {vendor, userAgent, maxTouchPoints, platform} = navigator;
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return vendor?.includes('Apple Computer')
		&& (userAgent.includes('Mobile/') || maxTouchPoints > 2)
		|| platform.includes('Mac');
})();
