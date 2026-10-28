declare module '/codemirror-mediawiki/dist/*' {
	export const CodeMirror6: typeof import('./index').CodeMirror6;
	export const registerCSS: typeof import('./index').registerCSS;
	export const registerHTML: typeof import('./index').registerHTML;
	export const registerJSON: typeof import('./index').registerJSON;
	export const registerJSONC: typeof import('./index').registerJSONC;
	export const registerJavaScript: typeof import('./index').registerJavaScript;
	export const registerLua: typeof import('./index').registerLua;
	export const registerMediaWiki: typeof import('./index').registerMediaWiki;
	export const registerVue: typeof import('./index').registerVue;
	export const registerAbuseFilter: typeof import('./index').registerAbuseFilter;
	export const registerTheme: typeof import('./index').registerTheme;
	export const registerBidiIsolates: typeof import('./index').registerBidiIsolates;
	export const nord: typeof import('./index').nord;
}

declare module '/codemirror-mediawiki/src/*' {
	export type MwConfig = import('./token').MwConfig;
	export type LintSource = import('./lintsource').LintSource;
}
