import {CodeMirror6} from './codemirror';
import 'wikiparser-node/extensions/typings';
import type * as Parser from 'wikiparser-node';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';
import type {MwConfig, LintSource} from './codemirror';

declare global {
	module '/*' {
		export {CodeMirror6};
		export type {MwConfig, LintSource};
	}

	interface LuaReport {
		line: number;
		column: number;
		end_column: number;
		msg: string;
		severity: 1 | 2;
	}

	const eslint: {
		Linter: new () => Linter;
	};
	const stylelint: PublicApi;
	const luacheck: {queue(s: string): Promise<LuaReport[]>};
	const Parser: Parser;
}
