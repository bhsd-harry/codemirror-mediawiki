import 'types-mediawiki';

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
}
