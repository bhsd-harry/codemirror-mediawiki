import {
	CodeMirror6,
	registerCSS,
	registerHTML,
	registerJSON,
	registerJavaScript,
	registerLua,
	registerMediaWiki,
	registerVue,
} from './codemirror';
import type {} from 'luacheck-browserify';
import type {} from 'wikiparser-node/extensions/typings';
import type * as Parser from 'wikiparser-node';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';
import type {MwConfig} from './codemirror';
import type {LintSource} from './lintsource';

declare global {
	module '/codemirror-mediawiki/*' {
		export {
			CodeMirror6,
			registerCSS,
			registerHTML,
			registerJSON,
			registerJavaScript,
			registerLua,
			registerMediaWiki,
			registerVue,
		};
		export type {MwConfig, LintSource};
	}

	const eslint: {
		Linter: typeof Linter;
	};
	const stylelint: PublicApi;
	const Parser: Parser;
}
