import {Decoration} from '@codemirror/view';
import {wmf} from '@bhsd/common';

export const baseData: Record<'CDN', string | undefined> = {CDN: undefined},
	hoverSelector = '.cm-tooltip-hover-mw',
	diagnosticSelector = '.cm-diagnosticText-clickable',
	panelSelector = '.cm-panel',
	panelsSelector = '.cm-panels',
	actionSelector = '.cm-diagnosticAction',
	doctagMark = /* @__PURE__ */ Decoration.mark({class: 'cm-doctag'}),
	typeMark = /* @__PURE__ */ Decoration.mark({class: 'cm-doctag-type'}),
	noDetectionLangs = new Set(['plain', 'mediawiki']),
	bgDark = '#4c566a',
	matchingCls = 'cm-matchingTag',
	nonmatchingCls = 'cm-nonmatchingTag';

export const isWMF = /* @__PURE__ */ (
	() => typeof location === 'object'
		&& new RegExp(String.raw`\.(?:${wmf})\.org$`, 'u').test(location.hostname)
)();

export const isMac = /* @__PURE__ */ (() => {
	const {vendor, userAgent, maxTouchPoints, platform} = navigator;
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return vendor?.includes('Apple Computer')
		&& (userAgent.includes('Mobile/') || maxTouchPoints > 2)
		|| platform.includes('Mac');
})();
