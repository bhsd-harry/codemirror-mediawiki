import {EditorView} from '@codemirror/view';
import {nord as nordBase} from 'cm6-theme-nord';
import type {Extension} from '@codemirror/state';

export const light = /* @__PURE__ */ EditorView.theme({
		'&': {
			backgroundColor: '#fff',
		},
		'&.cm-focused .cm-matchingTag': {
			backgroundColor: 'rgb(50,140,130,.32)',
		},
		'&.cm-focused .cm-nonmatchingTag': {
			backgroundColor: 'rgb(187,85,85,.27)',
		},
		'.cm-tooltip-hover code': {
			backgroundColor: '#e0e6eb',
		},
		'.cm-status-fix-menu': {
			backgroundColor: '#f5f5f5',
			boxShadow: '0 2px 2px 0 rgb(0,0,0,.25)',
		},
		'.cm-status-fix-menu>div:hover': {
			backgroundColor: '#e2f2ff',
		},
		'.cm-status-message': {
			borderColor: '#c8ccd1',
		},
		'.cm-content': {
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
			'--cm-var': '#ad9300',
			'--cm-var-name': '#ac6600',
		},
	}),

	/**
	 * @author 鬼影233
	 * @author Bhsd
	 * @see https://zh.moegirl.org.cn/User:%E9%AC%BC%E5%BD%B1233/nord-moeskin.css
	 */
	nord: Extension = [
		nordBase,
		/* @__PURE__ */ EditorView.theme({
			'div.cm-activeLine': {
				backgroundColor: 'rgb(76,86,106,.27)',
			},
			'&.cm-focused .cm-matchingTag': {
				backgroundColor: '#eceff4',
				color: '#434c5e',
			},
			'&.cm-focused .cm-nonmatchingTag': {
				backgroundColor: 'rgb(235,203,139,.32)',
			},
			['&.cm-focused>.cm-scroller>.cm-selectionLayer div.cm-selectionBackground,'
				+ '.cm-tooltip-hover code, .cm-status-fix-menu>div:hover, .cm-diagnosticAction, div.cm-tooltip-fold']: {
				backgroundColor: '#4c566a',
			},
			'div.cm-panels': {
				color: '#d8dee9',
			},
			'.cm-status-fix-menu': {
				backgroundColor: '#252a33',
			},
			'.cm-status-message': {
				borderColor: '#000',
			},
			'&.cm-focused .cm-searchMatch.cm-searchMatch-selected': {
				color: '#b48ead',
			},
			'div.cm-tooltip-autocomplete ul li[aria-selected]': {
				color: 'inherit',
			},
			'div.cm-gutters': {
				color: '#5e81ac',
			},
			'.cm-content': {
				'--cm-arg': '#9f78a5',
				'--cm-attr': '#97b757',
				'--cm-comment': '#4c566a',
				'--cm-convert': '#b68',
				'--cm-entity': '#00a1a1',
				'--cm-error': '#bf616a',
				'--cm-func': '#bf616a',
				'--cm-hr': '#5e81ac',
				'--cm-hr-bg': '#3b4252',
				'--cm-link': '#5e81ac',
				'--cm-sect': '#81a1c1',
				'--cm-sp': '#88c0d0',
				'--cm-table': '#b48ead',
				'--cm-table-attr': '#9f78a5',
				'--cm-tag': '#a3be8c',
				'--cm-tpl': '#9f78a5',
				'--cm-var': '#d08770',
				'--cm-var-name': '#d08770',
			},
		}),
	];
