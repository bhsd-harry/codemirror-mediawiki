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
	print: function ( string, style, line, ch, state ) {
		if ( string === '\n' ) {
			console.log( output );
			output = '';
		} else if ( string.length ) {
			try {
				const printStyle = ( style || '' ).trim()
					.replace( /(?:\bmw-| [\w-]+-ground\b)/g, '' )
					.replace( /\berror\b/, '\x1b[1;31merror\x1b[0m' );
				var color = 32; // green
				if ( /-(?:template|ext)\d?-link\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 35; // magenta
				} else if ( /-(?:template|ext)\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 33; // yellow
				} else if ( /-link\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 34; // blue
				}
				if ( /-invisible-/.test( style ) ) {
					color = color + 60 + ';7';
				}
				if ( lastStyle === style ) {
					output = output.slice( 0, -printStyle.length - 2 );
				}
				output += '\x1b[1;' + color + 'm' + string + '\x1b[0m{' + printStyle + '}';
				lastStyle = style;
				if ( style === undefined ) {
					console.log();
					console.log( { string: string, token: state.tokenize.name } );
					console.log();
				}
			} catch ( e ) {
				console.log();
				console.log( { string: string, style: style } );
				console.log();
			}
		}
	}
};
CodeMirror.runMode( text, 'text/mediawiki', callback[ process.argv[ 2 ] || 'error' ] );
console.log();
