import {wmf} from '@bhsd/common';

export const base: Record<'CDN', string | undefined> = {CDN: undefined},
	diagnosticSelector = '.cm-diagnosticText-clickable',
	hoverSelector = '.cm-tooltip-hover',
	matchingCls = 'cm-matchingBracket',
	nonmatchingCls = 'cm-nonmatchingBracket',
	isWMF = /* @__PURE__ */ (
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
