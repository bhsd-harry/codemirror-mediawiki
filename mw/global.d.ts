import 'types-mediawiki';
import type {Diagnostic} from '@codemirror/lint';
import type {LintError} from 'wikiparser-node';

declare global {
	namespace mw {
		const addWikiEditor: ($textarea: JQuery<HTMLTextAreaElement>) => void;
	}

	interface JQueryStatic {
		wikiEditor: {
			modules: {
				dialogs: {
					config: {
						getDefaultConfig(): object;
						replaceIcons($textarea: JQuery<HTMLTextAreaElement>): void;
					};
				};
				toolbar: {
					config: {
						getDefaultConfig(): object;
					};
				};
			};
		};
	}

	interface JQuery {
		wikiEditor(method: 'addModule', config: object): JQuery;
	}

	type Rule = LintError.Rule;

	type WikiDiagnostic = Diagnostic & {rule: Rule};

	interface MediaWikiPage {
		readonly revisions?: {
			readonly content: string;
		}[];
	}
	interface MediaWikiResponse {
		readonly query: {
			readonly pages: MediaWikiPage[];
		};
	}
}
