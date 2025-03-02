import {CodeMirror6} from './codemirror';
import 'luacheck-browserify';
import 'wikiparser-node/extensions/typings';
import type * as Parser from 'wikiparser-node';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';
import type {MwConfig, LintSource} from './codemirror';

declare global {
	module '/codemirror-mediawiki/*' {
		export {CodeMirror6};
		export type {MwConfig, LintSource};
	}

	const eslint: {
		Linter: new () => Linter;
	};
	const stylelint: PublicApi;
	const Parser: Parser;
}
