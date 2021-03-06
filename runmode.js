/* eslint-disable no-irregular-whitespace */
'use strict';

const fs = require( 'fs' ),
	text = fs.readFileSync( 'test.txt', 'utf8' ),
	{ argv: [ ,, mode = 'error' ] } = process;
global.CodeMirror = require( './codemirror' );
require( './test.js' );
CodeMirror.defaults.mwConfig = require( './config.json' );
CodeMirror.errorMsgs = require( './i18n/zh-hans.json' );
let output = '',
	lastStyle = null,
	finalState;
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
			lastStyle = null;
		} else if ( string.length ) {
			try {
				const printStyle = ( style || '' )
					.replace( /\s*\b(?:mw-pagename|strong|em|strikethrough)\b\s*/g, ' ' )
					.replace( /(?:\bmw-|\s*[\w-]+-ground\b)/g, '' )
					.replace( /\berror\b/, '\x1b[1;31merror\x1b[0m' ) // red
					.trim();
				let color = 32; // green
				if ( /-(?:template|ext)\d?-link\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 35; // magenta
				} else if ( /-(?:template|ext)\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 33; // yellow
				} else if ( /-link\d?-(?:invisible-)?ground\b/.test( style ) ) {
					color = 34; // blue
				}
				if ( /-invisible-/.test( style ) ) {
					color = `${color === 33 ? color : color + 60};1;7`;
				} else {
					if ( /\bstrong\b/.test( style ) ) {
						color += ';1';
					}
					if ( /\bem\b/.test( style ) ) {
						color += ';3';
					}
					if ( /\bstrikethrough\b/.test( style ) ) {
						color += ';9';
					}
				}
				if ( /\bmw-pagename\b/.test( style ) ) {
					color += ';4';
				}
				if ( lastStyle === style ) {
					const styleLength = printStyle.length + 22;
					output = `${output.slice( 0, -styleLength )}${string}${output.slice( -styleLength )}`;
				} else {
					output += `\x1b[${color}m${string}\x1b[0;1m(\x1b[0m${printStyle}\x1b[0;1m)\x1b[0m`;
				}
				lastStyle = style;
			} catch ( e ) {
				console.log();
				console.log( { string, style } );
				console.log();
			}
		}
	},
	token( string, _, __, ___, state ) {
		const style = state ? state.stack.concat( [ state.tokenize ] ).map( ( { name } ) => name ).join() : undefined;
		if ( string === '\n' ) {
			console.log( output );
			output = style === undefined ? '' : `\x1b[32m(${style})\x1b[0m`;
		} else if ( lastStyle === style ) {
			const styleLength = style.length + 11;
			output = `${output.slice( 0, -styleLength )}${string}${output.slice( -styleLength )}`;
		} else if ( style !== undefined ) {
			output += `${string}\x1b[32m(${style})\x1b[0m`;
		} else if ( string ) {
			console.log();
			console.log( { string, state } );
			console.log();
		}
		lastStyle = style === undefined ? lastStyle : style;
	},
};
if ( !( mode in callback ) ) {
	throw new RangeError( '???????????????????????????' );
}
CodeMirror.runMode( text, 'text/mediawiki', callback[ mode ] );
if ( mode === 'error' ) {
	console.log( `?????? \x1b[1;31m${ finalState.nExt }\x1b[0m ??????????????????` );
	console.log( `?????? \x1b[1;31m${ finalState.nTemplate }\x1b[0m ?????????` );
	console.log( `?????? \x1b[1;31m${ finalState.nLink }\x1b[0m ?????????` );
	console.log( `?????? \x1b[1;31m${ finalState.InHtmlTag.length }\x1b[0m ???HTML??????` );
	console.log( `?????? \x1b[1;31m${ finalState.nInvisible || 0 }\x1b[0m ??????????????????????????????` );
} else {
	console.log( output );
}
console.log();
