'use strict';

const fs = require( 'fs' ),
	text = fs.readFileSync( 'test.txt', 'utf8' );
global.CodeMirror = require( './codemirror' );
require( './mediawiki.js' );
CodeMirror.defaults.mwConfig = require( './config.json' );

let output = '';

function print( string ) {
	output += string;
}

console.time( 'CodeMirror' );
CodeMirror.runMode( text, 'text/mediawiki', print );
console.timeEnd( 'CodeMirror' );
console.log( output );
