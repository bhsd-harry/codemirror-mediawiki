/* eslint-disable no-irregular-whitespace */
'use strict';

const fs = require( 'fs' ),
	text = fs.readFileSync( 'test.txt', 'utf8' ),
	{ argv: [ ,, mode = 'error' ] } = process;
global.CodeMirror = require( './node_modules/codemirror/addon/runmode/runmode.node.js' );
require( './test.js' );
CodeMirror.defaults.mwConfig = require( './config.json' );
CodeMirror.errorMsgs = require( './i18n/zh-hans.json' );
let output = '',
	lastStyle, finalState;
const callback = {
	error( string, style, line, ch, state ) {
		if ( /\berror\b/.test( style ) ) {
			console.log( { string, line: line + 1, ch: ch + 1, error: state.errors.pop() } );
		}
		if ( typeof state === 'object' ) {
			finalState = state;
		}
	},
	print( string, style ) {
		if ( string === '\n' ) {
			console.log( output );
			output = '';
		} else if ( string.length ) {
			try {
				const printStyle = ( style || '' ).trim()
					.replace( /(?:\bmw-| [\w-]+-ground\b)/g, '' )
					.replace( /\berror\b/, '\x1b[1;31merror\x1b[0m' ); // red
				let color = 32; // green
				if ( /-(?:template|ext)\d?-link\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 35; // magenta
				} else if ( /-(?:template|ext)\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 33; // yellow
				} else if ( /-link\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 34; // blue
				}
				if ( /-invisible-/.test( style ) ) {
					color = `${color + 60};7`;
				}
				if ( lastStyle === style ) {
					output = output.slice( 0, -printStyle.length - 2 );
				}
				output += `\x1b[1;${color}m${string}\x1b[0m{${printStyle}}`;
				lastStyle = style;
			} catch ( e ) {
				console.log();
				console.log( { string, style } );
				console.log();
			}
		}
	}
};
CodeMirror.runMode( text, 'text/mediawiki', callback[ mode ] );
if ( mode === 'error' ) {
	console.log( `还有 \x1b[1;31m${ finalState.nExt }\x1b[0m 个解析器函数` );
	console.log( `　　 \x1b[1;31m${ finalState.nTemplate }\x1b[0m 个模板` );
	console.log( `　　 \x1b[1;31m${ finalState.nLink }\x1b[0m 个链接` );
	console.log( `　　 \x1b[1;31m${ finalState.InHtmlTag.length }\x1b[0m 个HTML标签未闭合。` );
}
console.log();
