import {CodeMirror6} from './codemirror';
import 'wikiparser-node/extensions/typings';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';
import type {MwConfig, LintSource} from './codemirror';

interface luaparse {
	defaultOptions: {luaVersion: string};
	parse(s: string): void;
	SyntaxError: new () => {message: string, index: number};
}

declare global {
	module '/*' {
		export {CodeMirror6};
		export type {MwConfig, LintSource};
	}

	const eslint: {
		Linter: new () => Linter;
	};
	const stylelint: PublicApi;
	const luaparse: luaparse;
}
