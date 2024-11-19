import {CodeMirror6} from './codemirror';
import 'wikiparser-node/extensions/typings';
import type * as Parser from 'wikiparser-node';
import type {Linter} from 'eslint';
import type {PublicApi} from 'stylelint';
import type {MwConfig, LintSource} from './codemirror';

interface LuaNode {
	name: string;
	range: [number, number];
}
interface luaparse {
	defaultOptions: {luaVersion: string};
	parse(s: string): {globals: LuaNode[]};
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
	const Parser: Parser;
}
