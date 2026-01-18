import {
	CodeMirror6,
	registerCSS,
	registerHTML,
	registerJSON,
	registerJavaScript,
	registerLua,
	registerMediaWiki,
	registerVue,
	registerTheme,
	registerBidiIsolates,
	nord,
} from './index';
import type {} from 'luacheck-browserify';
import type {} from 'wikiparser-node/extensions/typings';
import type * as Parser from 'wikiparser-node';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';
import type {LintSource} from './lintsource';
import type {MwConfig} from './token';

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
			registerTheme,
			registerBidiIsolates,
			nord,
		};
		export type {MwConfig, LintSource};
	}

	const eslint: {
		Linter: typeof Linter;
	};
	const stylelint: PublicApi;
	const Parser: Parser;
}
