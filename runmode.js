'use strict';

const fs = require( 'fs' ),
	text = fs.readFileSync( 'test.txt', 'utf8' );
global.CodeMirror = require( './node_modules/codemirror/addon/runmode/runmode.node.js' );
require( './test.js' );
CodeMirror.defaults.mwConfig = require( './config.json' );
var output = '',
	lastStyle;
const callback = {
	error: function ( string, style, line, ch ) {
		if ( /\berror\b/.test( style ) ) {
			console.log( { string: string, line: line, ch: ch } );
		}
	},
	print: function ( string, style ) {
		if ( string === '\n' ) {
			console.log( output );
			output = '';
		} else if ( string.length ) {
			style = ( style || '' ).trim().replace( /\bmw-/g, '' );
			if ( lastStyle === style ) {
				output = output.slice( 0, -style.length - 11 );
			}
			output += string + '\x1b[32m{' + style + '}\x1b[0m';
			lastStyle = style;
		}
	}
};
CodeMirror.runMode( text, 'text/mediawiki', callback[ process.argv[ 2 ] || 'error' ] );
