/* eslint-disable no-irregular-whitespace */
'use strict';

const fs = require( 'fs' ),
	text = fs.readFileSync( 'test.txt', 'utf8' ),
	{ argv: [ ,, mode = 'error' ] } = process,
	errorMsgs = {
		'invalid-char-pagename': '页面名称出现无效字符"$1"。',
		'invalid-char-link-section': '章节链接出现无效字符"$1"。',
		'link-in-link': '$1部链接中不应包含内部链接。',
		'sign-in-link': '$1部链接中不应包含签名。',
		'sign-pagename': '页面名称不应包含签名。',
		'tag-in-link-section': '章节链接中不应包含$1标签。',
		'link-text-redirect': '重定向不应包含链接文字。',
		'open-link': '上一行的$1链接未闭合。',
		'fail-close-link': '未能闭合$1链接'
	};
global.CodeMirror = require( './node_modules/codemirror/addon/runmode/runmode.node.js' );
global.newError = function ( state, key, arg ) {
	const msg = errorMsgs[ key ];
	state.errors.push( arg === undefined ? msg : msg.replace( '$1', arg ) );
};
require( './test.js' );
CodeMirror.defaults.mwConfig = require( './config.json' );
let output = '',
	lastStyle, finalState;
const callback = {
	error( string, style, line, ch, state ) {
		if ( /\berror\b/.test( style ) ) {
			console.log( { string, line: line + 1, ch: ch + 1, error: state.errors.shift() } );
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
