import {EditorView} from '@codemirror/view';
import {
	stickyScroll,
	defaultExcludeNode,
} from '@bhsd/codemirror-stickyscroll';
import type {Extension} from '@codemirror/state';
import type {CodeMirror6} from './codemirror';

const LUA_INDENT_PATTERN = /\bfunction\s*(?:[\w.:]+\s*)?\([^)]*\)(?:\s*--.*)?$|(?:^|\s)(?:then|do|repeat|else)$/u;

export default (
	e: Extension = [],
	cm?: CodeMirror6,
): Extension => [
	stickyScroll({
		excludeNode(
			typeName,
			langName,
			ownerName,
		) {
			return langName === 'abusefilter'
				|| langName === 'lua' && !LUA_INDENT_PATTERN.test(ownerName!)
				|| langName !== 'mediawiki' && defaultExcludeNode(typeName, langName, ownerName);
		},
		...cm?.font && {class: cm.font},
	}),
	e,
];

export const mediawikiStickyScroll = /* #__PURE__*/ EditorView.theme({
	'.cm-stickyscroll-code': {
		'& .cm-mw-section--1, & .cm-mw-section--2': {
			fontSize: 'inherit',
			lineHeight: 'inherit',
			fontWeight: 'bold',
		},
		'& .cm-mw-section-header': {
			fontWeight: 'normal',
		},
	},
});
