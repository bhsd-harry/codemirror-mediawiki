import {
	CodeMirror6,
	registerCSS,
	registerHTML,
	registerJSON,
	registerJavaScript,
	registerLua,
	registerMediaWiki,
	registerVue,
	registerAbuseFilter,
	registerTheme,
	registerBidiIsolates,
	nord,
} from './index';
import type {} from 'luacheck-browserify';
import type {} from 'wikiparser-node/extensions/typings';
import type * as Parser from 'wikiparser-node';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';
import type {eslint as eslintGlobal} from '@bhsd/eslint-browserify';
import type {Dialect} from '@bhsd/lezer-abusefilter';
import type {LintSource} from './lintsource';
import type {MwConfig} from './token';

declare global {
	module '@eslint/js/*' {
		const recommended: Linter.LegacyConfig;
		export default recommended;
	}
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
			registerAbuseFilter,
			registerTheme,
			registerBidiIsolates,
			nord,
		};
		export type {MwConfig, LintSource};
	}
	module '/lezer-abusefilter/*' {
		const dialect: Dialect;
		export default dialect;
	}

	const eslint: typeof eslintGlobal;
	const stylelint: PublicApi;
	const Parser: Parser;
}
