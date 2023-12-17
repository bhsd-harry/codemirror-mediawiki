import { CodeMirror6 } from './dist/main.min.js';

( () => {
	const /** @type {HTMLTextAreaElement} */ textarea = document.querySelector( '#wpTextbox' ),
		/** @type {NodeListOf<HTMLInputElement>} */ languages = document.querySelectorAll( 'input[name="language"]' ),
		/** @type {NodeListOf<HTMLInputElement>} */ extensions = document.querySelectorAll( 'input[type="checkbox"]' ),
		/** @type {HTMLInputElement} */ indent = document.querySelector( '#indent' ),
		/** @type {import('./src/codemirror').CodeMirror6} */ cm = new CodeMirror6( textarea );
	let config;

	/** 设置语言 */
	const init = /** @param {string} lang */ async ( lang ) => {
		if ( lang === 'mediawiki' ) {
			// eslint-disable-next-line require-atomic-updates
			config = config || await ( await fetch( 'config.json' ) ).json();
		}
		cm.setLanguage( lang, config );
	};

	/** 设置扩展 */
	const prefer = () => {
		const preferred = [ ...extensions ].filter( ( { checked } ) => checked ).map( ( { id } ) => id );
		cm.prefer( preferred );
	};

	/** 设置缩进 */
	const indentChange = () => {
		cm.setIndent( indent.value || '\t' );
	};

	for ( const input of languages ) {
		input.addEventListener( 'change', () => {
			init( input.id );
		} );
		if ( input.checked ) {
			init( input.id );
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
