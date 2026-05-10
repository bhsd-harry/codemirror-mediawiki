import {EditorView} from '@codemirror/view';
import {defaultHighlightStyle} from '@codemirror/language';
import {nord} from 'cm6-theme-nord';
import {
	matchingCls,
	nonmatchingCls,
	actionSelector,
	panelsSelector,
	bgDark,
	cursorColor,
	guideColor,
} from './constants.js';
import {getHighlightExtension} from './util.js';
import type {Extension} from '@codemirror/state';

const focused = '&.cm-focused',
	searchMatch = '.cm-searchMatch.cm-searchMatch-selected',
	matching = `${focused} .${matchingCls}`,
	nonmatching = `${focused} .${nonmatchingCls}`;

export const lightHighlightStyle = /* #__PURE__ */ (() => getHighlightExtension(
	defaultHighlightStyle.specs,
	{themeType: 'light'},
))();

export const light = /* #__PURE__ */ EditorView.theme({
		'&': {
			backgroundColor: '#fff',
			'--cm-arg': '#b0c',
			'--cm-attr': '#179b1c',
			'--cm-comment': '#7b8c8f',
			'--cm-convert': '#b68',
			'--cm-entity': '#00a1a1',
			'--cm-error': '#d73333',
			'--cm-func': '#a11',
			'--cm-hr': '#0076dd',
			'--cm-hr-bg': 'rgb(0,0,0,.07)',
			'--cm-link': '#000aaa',
			'--cm-sect': '#006fe6',
			'--cm-sp': 'rgb(134,206,255,.3)',
			'--cm-table': '#d08',
			'--cm-table-attr': '#f500d4',
			'--cm-tag': '#14866d',
			'--cm-tpl': '#80c',
			'--cm-var-name': '#ac6600',
			'--cm-ref': 'rgb(223,242,235,.5)',
			'--cm-active': '#05f',
			[guideColor]: '#f0f0f0',
			[cursorColor]: '#222',
		},
		'.cm-globals': {
			'&,&>*': {
				color: '#164',
			},
		},
		'.cm-doctag>*': {
			color: '#219',
		},
		'.cm-doctag-type>*': {
			color: '#085',
		},
		'.cm-doctag-var>*': {
			color: '#00f',
		},
		[matching]: {
			backgroundColor: 'rgb(50,140,130,.32)',
		},
		[nonmatching]: {
			backgroundColor: 'rgb(187,85,85,.27)',
		},
	}),

	/**
	 * @author 鬼影233
	 * @author Bhsd
	 * @see https://zh.moegirl.org.cn/User:%E9%AC%BC%E5%BD%B1233/nord-moeskin.css
	 */
	nordDark = /* #__PURE__ */ ((): Extension => [
		nord,
		EditorView.theme({
			'&': {
				'--cm-arg': '#9f78a5',
				'--cm-attr': '#97b757',
				'--cm-comment': bgDark,
				'--cm-convert': '#b68',
				'--cm-entity': '#00a1a1',
				'--cm-error': '#bf616a',
				'--cm-func': '#bf616a',
				'--cm-hr': '#5e81ac',
				'--cm-hr-bg': 'rgb(59,66,82,.5)',
				'--cm-link': '#5e81ac',
				'--cm-sect': '#81a1c1',
				'--cm-sp': 'rgb(136,192,208,.5)',
				'--cm-table': '#b48ead',
				'--cm-table-attr': '#9f78a5',
				'--cm-tag': '#a3be8c',
				'--cm-tpl': '#9f78a5',
				'--cm-var-name': '#d08770',
				'--cm-ref': 'rgb(60,90,80,0.5)',
				'--cm-active': '#b6d4fb',
				[guideColor]: '#45494e',
				[cursorColor]: '#fff',
			},
			'.cm-globals': {
				'&,&>*': {
					color: '#d08770',
				},
			},
			'.cm-doctag>*': {
				color: '#81a1c1',
			},
			'.cm-doctag-type>*': {
				color: '#ebcb8b',
			},
			'.cm-doctag-var>*': {
				color: '#8fbcbb',
			},
			'div.cm-activeLine': {
				backgroundColor: 'rgb(76,86,106,.27)',
			},
			[matching]: {
				backgroundColor: '#eceff4',
				color: '#434c5e',
			},
			[nonmatching]: {
				backgroundColor: 'rgb(235,203,139,.32)',
			},
			[`${focused}>.cm-scroller>.cm-selectionLayer div.cm-selectionBackground,${actionSelector}`]: {
				backgroundColor: bgDark,
			},
			[`div${panelsSelector}`]: {
				color: '#d8dee9',
			},
			[`${searchMatch} span`]: {
				color: '#2e3440',
			},
			[`${focused} ${searchMatch}`]: {
				'&,& span': {
					color: '#b48ead',
				},
			},
			'div.cm-tooltip-autocomplete ul li[aria-selected]': {
				color: 'inherit',
			},
			'div.cm-gutters': {
				color: '#5e81ac',
			},
			'span.cm-foldPlaceholder': {
				backgroundColor: bgDark,
			},
		}),
	])();
