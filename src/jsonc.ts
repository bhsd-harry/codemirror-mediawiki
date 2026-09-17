import {jsoncLanguage} from '@bhsd/lezer-json';
import {LanguageSupport} from '@codemirror/language';
import {getMarkPlugin, markLinkBasic} from './util.js';
import type {CodeMirror6} from './codemirror';

export default (_?: unknown, cm?: CodeMirror6): LanguageSupport => {
	const plugin = getMarkPlugin(markLinkBasic(), cm);
	if (cm) {
		cm.decorationPlugin = plugin;
	}
	return new LanguageSupport(jsoncLanguage, plugin);
};
