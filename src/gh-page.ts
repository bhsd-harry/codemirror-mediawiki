// @ts-expect-error no type declaration
import { CodeMirror6 } from './dist/main.min.js';
import type { CodeMirror6 as CodeMirror, MwConfig, LintSource } from './codemirror.js';

( () => {
	const textarea = document.querySelector<HTMLTextAreaElement>( '#wpTextbox' )!,
		languages = document.querySelectorAll<HTMLInputElement>( 'input[name="language"]' ),
		extensions = document.querySelectorAll<HTMLInputElement>( 'input[type="checkbox"]' ),
		indent = document.querySelector<HTMLInputElement>( '#indent' )!,
		cm: CodeMirror = new CodeMirror6( textarea ),
		linters: Record<string, LintSource> = {};
	let config: MwConfig | undefined;

	/** 设置语言 */
	const init = async ( lang: string ): Promise<void> => {
		if ( lang === 'mediawiki' ) {
			// eslint-disable-next-line require-atomic-updates
			config ??= await ( await fetch( 'config.json' ) ).json();
		}
		cm.setLanguage( lang, config );
		if ( !( lang in linters ) ) {
			linters[ lang ] = await cm.getLinter();
			if ( lang === 'mediawiki' ) {
				wikiparse.setConfig( await ( await fetch( '/wikiparser-node/config/default.json' ) ).json() );
			}
			cm.lint( linters[ lang ] );
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
