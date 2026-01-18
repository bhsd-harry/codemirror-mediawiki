export const base: Record<'CDN', string | undefined> = {CDN: undefined},
	hoverSelector = '.cm-tooltip-hover-mw',
	diagnosticSelector = '.cm-diagnosticText-clickable',
	bgDark = '#4c566a',
	matchingCls = 'cm-matchingTag',
	nonmatchingCls = 'cm-nonmatchingTag';

export const isMac = /* @__PURE__ */ (() => {
	const {vendor, userAgent, maxTouchPoints, platform} = navigator;
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return vendor?.includes('Apple Computer')
		&& (userAgent.includes('Mobile/') || maxTouchPoints > 2)
		|| platform.includes('Mac');
})();
