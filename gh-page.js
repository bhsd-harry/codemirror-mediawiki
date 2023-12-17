import { CodeMirror6 } from './dist/main.min.js';

( () => {
	const textarea = document.querySelector( '#wpTextbox' ),
		input = document.querySelector( '#mediawiki' ),
		cm = new CodeMirror6( textarea );

	const initMediawiki = async () => {
		const config = await ( await fetch( 'http://127.0.0.1:8080/config.json' ) ).json();
		cm.setLanguage( 'mediawiki', config );
	};

	input.addEventListener( 'change', () => {
		if ( input.checked ) {
			initMediawiki();
		} else {
			cm.setLanguage( 'plain' );
		}
	} );
	if ( input.checked ) {
		initMediawiki();
	}
} )();
