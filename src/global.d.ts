import type { Linter } from 'eslint';
import type { LinterOptions, LinterResult } from 'stylelint';
import type { Diagnostic } from '@codemirror/lint';

class WikiLinter {
	codemirror( s: string ): Promise<Diagnostic[]>;
}

interface luaparse {
	parse( s: string ): void;
	SyntaxError: new () => { message: string, index: number };
}

declare global {
	const wikiparse: {
		Linter: new () => WikiLinter;
	};
	const eslint: {
		Linter: new () => Linter;
	};
	const stylelint: {
		lint( option: LinterOptions ): Promise<LinterResult>;
	};
	const luaparse: luaparse;
}
