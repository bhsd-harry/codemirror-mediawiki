import stylelint from 'stylelint';
import '@bhsd/eslint-browserify';
import Parser from 'wikiparser-node';
import 'luacheck-browserify';
import type {Diagnostic, CodeAction} from 'vscode-languageserver-types';
import type {AST} from 'wikiparser-node';

class LanguageService {
	lsp = Parser.createLanguageService();

	constructor(include = false) {
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
	wikiparse: {LanguageService},
});
