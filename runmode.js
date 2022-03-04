'use strict';

const fs = require( 'fs' ),
	CodeMirror = require( './node_modules/codemirror/addon/runmode/runmode.node.js' ),
	text = fs.readFileSync( 'test.txt', 'utf8' );
require( './test.js' );
CodeMirror.defaults.mwConfig = require( './config.json' );
CodeMirror.runMode( text, 'text/mediawiki', callback );

function callback( string, style, line, ch ) {
	if ( /\berror\b/.test( style ) ) {
		console.log( { string: string, line: line, ch: ch } );
	}
}
