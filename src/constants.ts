import {Decoration} from '@codemirror/view';
import {wmf} from '@bhsd/common';
import type {Completion} from '@codemirror/autocomplete';

export const baseData: Record<'CDN', string | undefined> = {CDN: undefined},
	extData: Record<string, Set<string>> = {},
	extCompletion: Record<string, Completion[]> = {},
	mwPrefix = 'cm-mw-',
	mwTag = 'mw-tag-',
	placeholder = 'cm-foldPlaceholder',
	hoverSelector = '.cm-tooltip-hover-mw',
	diagnosticSelector = '.cm-diagnosticText-clickable',
	panelSelector = '.cm-panel',
	panelsSelector = '.cm-panels',
	actionSelector = '.cm-diagnosticAction',
	linkSelector = '.cm-link',
	contentSelector = '.cm-content',
	scrollerSelector = '.cm-scroller',
	focused = '&.cm-focused',
	doctagMark = /* #__PURE__ */ Decoration.mark({class: 'cm-doctag'}),
	typeMark = /* #__PURE__ */ Decoration.mark({class: 'cm-doctag-type'}),
	noDetectionLangs = new Set(['plain', 'mediawiki']),
	bgDark = '#4c566a',
	cursorColor = '--cursor-color',
	guideColor = '--col-guide',
	matchingCls = 'cm-matchingTag',
	nonmatchingCls = 'cm-nonmatchingTag';

export const isWMF = /* #__PURE__ */ (
	() => typeof location === 'object'
		&& new RegExp(String.raw`\.(?:${wmf})\.org$`, 'u').test(location.hostname)
)();

export const isMac = /* #__PURE__ */ (() => {
	const {vendor, userAgent, maxTouchPoints, platform} = navigator;
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return vendor?.includes('Apple Computer')
		&& (userAgent.includes('Mobile/') || maxTouchPoints > 2)
		|| platform.includes('Mac');
})();
