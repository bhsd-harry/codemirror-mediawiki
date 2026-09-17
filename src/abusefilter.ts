import {abusefilterCore} from '@bhsd/lezer-abusefilter';
import {getMarkPlugin, markLinkBasic} from './util.js';
import type {Extension} from '@codemirror/state';
import type {Dialect} from '@bhsd/lezer-abusefilter';
import type {CodeMirror6} from './codemirror';

export default (dialect?: Dialect, cm?: CodeMirror6): Extension => [
	abusefilterCore(dialect),
	getMarkPlugin(markLinkBasic(), cm),
];
