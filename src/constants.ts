import {wmf} from '@bhsd/common';

export const base: Record<'CDN', string | undefined> = {CDN: undefined},
	hoverSelector = '.cm-tooltip-hover-mw',
	diagnosticSelector = '.cm-diagnosticText-clickable',
	panelSelector = '.cm-panel',
	panelsSelector = '.cm-panels',
	foldSelector = '.cm-tooltip-fold',
	isolateSelector = '.cm-bidi-isolate',
	ltrSelector = '.cm-bidi-ltr',
	menuSelector = '.cm-status-fix-menu',
	messageSelector = '.cm-status-message',
	actionSelector = '.cm-diagnosticAction',
	matchingCls = 'cm-matchingTag',
	nonmatchingCls = 'cm-nonmatchingTag';

export const isWMF = /* @__PURE__ */ (
		() => typeof location === 'object'
			&& new RegExp(String.raw`\.(?:${wmf})\.org$`, 'u').test(location.hostname)
	)(),
	isMac = /* @__PURE__ */ (() => {
		const {vendor, userAgent, maxTouchPoints, platform} = navigator;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		return vendor?.includes('Apple Computer')
			&& (userAgent.includes('Mobile/') || maxTouchPoints > 2)
			|| platform.includes('Mac');
	})();
