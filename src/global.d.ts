import {CodeMirror6} from './codemirror';
import type {Linter} from 'eslint';
import type {LinterOptions, LinterResult} from 'stylelint';
import type {Diagnostic} from '@codemirror/lint';
import type {MwConfig, LintSource} from './codemirror';

class WikiLinter {
	codemirror(s: string): Promise<Diagnostic[]>;
}

interface luaparse {
	parse(s: string): void;
	SyntaxError: new () => {message: string, index: number};
}

declare global {
	module '/*' {
		export {CodeMirror6};
		export type {MwConfig, LintSource};
	}
	module 'https://*' {
		const CDN: string;
		export {CodeMirror6, CDN};
	}

	const wikiparse: {
		getConfig(): Promise<Config>;
		setConfig(config: Config): void;
		setI18N(i18n: Record<string, string>): void;
		Linter: new (include?: boolean) => WikiLinter;
	};
	const eslint: {
		Linter: new () => Linter;
	};
	const stylelint: {
		lint(option: LinterOptions): Promise<LinterResult>;
	};
	const luaparse: luaparse;
}
