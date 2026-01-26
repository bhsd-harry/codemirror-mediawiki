// @ts-expect-error unresolvable import
import * as stylelint from 'stylelint';
import * as eslint from 'eslint';
import * as Parser from 'wikiparser-node';
import 'luacheck-browserify';
import type {Diagnostic, CodeAction} from 'vscode-languageserver-types';
import type {AST} from 'wikiparser-node';

class Linter extends eslint.Linter {
	constructor() {
		super({configType: 'eslintrc'});
	}
}

class LanguageService {
	declare lsp: Parser.LanguageService;

	constructor(include = false) {
		this.lsp = Parser.createLanguageService();
		this.lsp.include = include;
	}

	provideDiagnostics(text: string): Promise<Diagnostic[]> {
		return this.lsp.provideDiagnostics(text);
	}

	findStyleTokens(): AST[] {
		return (this.lsp as Parser.LanguageService & {findStyleTokens(): Parser.Token[]}).findStyleTokens()
			.map(token => token.json());
	}

	resolveCodeAction(rule: string): CodeAction {
		return this.lsp.resolveCodeAction({
			title: `Fix all: ${rule}`,
			kind: 'source.fixAll',
			data: {rule},
		});
	}
}

Object.assign(globalThis, {
	stylelint,
	eslint: {Linter},
	wikiparse: {LanguageService},
});
