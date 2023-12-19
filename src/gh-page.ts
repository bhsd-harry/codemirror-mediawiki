// @ts-expect-error no type declaration
import { CodeMirror6 } from './dist/main.min.js';
import type { Linter } from 'eslint';
import type { LintResult } from 'stylelint';
import type { Diagnostic } from '@codemirror/lint';
import type { CodeMirror6 as CodeMirror, MwConfig } from './codemirror';

declare type LintSource = ( s: string ) => Diagnostic[] | Promise<Diagnostic[]>;
declare interface luaparse {
	parse( s: string ): void;
	SyntaxError: new () => { message: string, index: number };
}

( () => {
	const textarea = document.querySelector<HTMLTextAreaElement>( '#wpTextbox' )!,
		languages = document.querySelectorAll<HTMLInputElement>( 'input[name="language"]' ),
		extensions = document.querySelectorAll<HTMLInputElement>( 'input[type="checkbox"]' ),
		indent = document.querySelector<HTMLInputElement>( '#indent' )!,
		cm: CodeMirror = new CodeMirror6( textarea ),
		linters: Record<string, LintSource> = {};
	let config: MwConfig | undefined;

	/** 使用传统方法加载脚本 */
	const loadScript = ( lang: string, src: string, callback: () => LintSource ): void => {
		const script = document.createElement( 'script' );
		script.src = `https://testingcf.jsdelivr.net/${ src }`;
		script.onload = (): void => {
			const lintSource = callback();
			linters[ lang ] = lintSource;
			cm.lint( lintSource );
		};
		document.head.append( script );
	};

	/** 设置语言 */
	const init = async ( lang: string ): Promise<void> => {
		if ( lang === 'mediawiki' ) {
			// eslint-disable-next-line require-atomic-updates
			config ??= await ( await fetch( 'config.json' ) ).json();
		}
		cm.setLanguage( lang, config );
		if ( !( lang in linters ) ) {
			switch ( lang ) {
				case 'mediawiki': {
					const src = 'combine/npm/wikiparser-node@1.1.3-b/extensions/dist/base.min.js,'
						+ 'npm/wikiparser-node@1.1.3-b/extensions/dist/lint.min.js';
					const callback = (): LintSource => {
						// @ts-expect-error global variable
						const linter: { codemirror: LintSource } = new window.wikiparse.Linter();
						return ( s ) => linter.codemirror( s );
					};
					loadScript( lang, src, callback );
					break;
				}
				case 'javascript': {
					const src = 'npm/eslint-linter-browserify';
					/** @see https://npmjs.com/package/@codemirror/lang-javascript */
					const callback = (): LintSource => {
						// @ts-expect-error global variable
						const linter: Linter = new window.eslint.Linter(),
							conf: Linter.Config = {
								env: {
									browser: true,
									es2018: true
								},
								parserOptions: {
									ecmaVersion: 9,
									sourceType: 'module'
								},
								rules: {}
							};
						for ( const [ name, { meta } ] of linter.getRules() ) {
							if ( meta?.docs!.recommended ) {
								conf.rules![ name ] = 2;
							}
						}
						return ( s ) => linter.verify( s, conf )
							.map( ( { message, severity, line, column, endLine, endColumn } ) => {
								const from = cm.view.state.doc.line( line ).from + column - 1;
								return {
									message,
									severity: severity === 1 ? 'warning' : 'error',
									from,
									to: endLine === undefined
										? from + 1
										: cm.view.state.doc.line( endLine ).from + endColumn! - 1
								};
							} );
					};
					loadScript( lang, src, callback );
					break;
				}
				case 'css': {
					/** @see https://npmjs.com/package/stylelint-config-recommended */
					const conf = {
						rules: {
							'annotation-no-unknown': true,
							'at-rule-no-unknown': true,
							'block-no-empty': true,
							'color-no-invalid-hex': true,
							'comment-no-empty': true,
							'custom-property-no-missing-var-function': true,
							'declaration-block-no-duplicate-custom-properties': true,
							'declaration-block-no-duplicate-properties': [
								true,
								{
									ignore: [ 'consecutive-duplicates-with-different-syntaxes' ]
								}
							],
							'declaration-block-no-shorthand-property-overrides': true,
							'font-family-no-duplicate-names': true,
							'font-family-no-missing-generic-family-keyword': true,
							'function-calc-no-unspaced-operator': true,
							'function-linear-gradient-no-nonstandard-direction': true,
							'function-no-unknown': true,
							'keyframe-block-no-duplicate-selectors': true,
							'keyframe-declaration-no-important': true,
							'media-feature-name-no-unknown': true,
							'media-query-no-invalid': true,
							'named-grid-areas-no-invalid': true,
							'no-descending-specificity': true,
							'no-duplicate-at-import-rules': true,
							'no-duplicate-selectors': true,
							'no-empty-source': true,
							'no-invalid-double-slash-comments': true,
							'no-invalid-position-at-import-rule': true,
							'no-irregular-whitespace': true,
							'property-no-unknown': true,
							'selector-anb-no-unmatchable': true,
							'selector-pseudo-class-no-unknown': true,
							'selector-pseudo-element-no-unknown': true,
							'selector-type-no-unknown': [
								true,
								{
									ignore: [ 'custom-elements' ]
								}
							],
							'string-no-newline': true,
							'unit-no-unknown': true
						}
					};
					const src = 'gh/openstyles/stylelint-bundle/dist/stylelint-bundle.min.js';
					const lintSource: LintSource = async ( s ) => {
						const { results }: { results: LintResult[] }
							// @ts-expect-error global variable
							= await window.stylelint.lint( { code: s, config: conf } );
						return results.flatMap( ( { warnings } ) => warnings )
							.map( ( { text, severity, line, column, endLine, endColumn } ) => ( {
								message: text,
								severity,
								from: cm.view.state.doc.line( line ).from + column - 1,
								to: endLine === undefined
									? cm.view.state.doc.line( line ).to
									: cm.view.state.doc.line( endLine ).from + endColumn! - 1
							} ) );
					};
					loadScript( lang, src, () => lintSource );
					break;
				}
				case 'lua': {
					const src = 'npm/luaparse';
					/** @see https://github.com/ajaxorg/ace/blob/master/lib/ace/mode/lua_worker.js */
					const lintSource: LintSource = ( s ) => {
						// @ts-expect-error global variable
						const { luaparse }: { luaparse: luaparse } = window;
						try {
							luaparse.parse( s );
						} catch ( e ) {
							if ( e instanceof luaparse.SyntaxError ) {
								return [
									{
										message: e.message,
										severity: 'error',
										from: e.index,
										to: e.index
									}
								];
							}
						}
						return [];
					};
					loadScript( lang, src, () => lintSource );
				}
				// no default
			}
		}
	};

	/** 设置扩展 */
	const prefer = (): void => {
		const preferred = [ ...extensions ].filter( ( { checked } ) => checked ).map( ( { id } ) => id );
		cm.prefer( preferred );
	};

	/** 设置缩进 */
	const indentChange = (): void => {
		cm.setIndent( indent.value || '\t' );
	};

	for ( const input of languages ) {
		input.addEventListener( 'change', () => {
			void init( input.id );
		} );
		if ( input.checked ) {
			void init( input.id );
		}
	}
	for ( const extension of extensions ) {
		extension.addEventListener( 'change', prefer );
	}
	prefer();
	indent.addEventListener( 'change', indentChange );
	indentChange();

	Object.assign( window, { cm } );
} )();
