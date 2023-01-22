/*
 * CodeMirror, copyright (c) by Marijn Haverbeke and others
 * Distributed under an MIT license: https://codemirror.net/LICENSE
 */

'use strict';

// STRING STREAM

/*
 * Fed to the mode parsers, provides helper functions to make
 * parsers more succinct.
 */

class StringStream {
	constructor( string, lineOracle ) {
		this.pos = 0;
		this.start = 0;
		this.string = string;
		this.lineStart = 0;
		this.lineOracle = lineOracle;
	}

	eol() {
		return this.pos >= this.string.length;
	}
	sol() {
		return this.pos === this.lineStart;
	}
	peek() {
		return this.string.charAt( this.pos ) || undefined;
	}
	next() {
		if ( !this.eol() ) {
			return this.string.charAt( this.pos++ );
		}
	}
	eat( match ) {
		const ch = this.string.charAt( this.pos );
		let ok;
		if ( typeof match === 'string' ) {
			ok = ch === match;
		} else {
			ok = ch && ( match.test ? match.test( ch ) : match( ch ) );
		}
		if ( ok ) {
			++this.pos;
			return ch;
		}
	}
	eatWhile( match ) {
		const start = this.pos;
		while ( this.eat( match ) ) {
			// pass
		}
		return this.pos > start;
	}
	eatSpace() {
		const start = this.pos;
		while ( /[\s\xa0]/.test( this.string.charAt( this.pos ) ) ) {
			++this.pos;
		}
		return this.pos > start;
	}
	skipToEnd() {
		this.pos = this.string.length;
	}
	skipTo( ch ) {
		const found = this.string.indexOf( ch, this.pos );
		if ( found > -1 ) {
			this.pos = found;
			return true;
		}
	}
	backUp( n ) {
		this.pos -= n;
	}
	match( pattern, consume, caseInsensitive ) {
		if ( typeof pattern === 'string' ) {
			const cased = function ( str ) {
				return caseInsensitive ? str.toLowerCase() : str;
			};
			const substr = this.string.substr( this.pos, pattern.length );
			if ( cased( substr ) === cased( pattern ) ) {
				if ( consume !== false ) {
					this.pos += pattern.length;
				}
				return true;
			}
		} else {
			const match = this.string.slice( this.pos ).match( pattern );
			if ( match && match.index > 0 ) {
				return null;
			} else if ( match && consume !== false ) {
				this.pos += match[ 0 ].length;
			}
			return match;
		}
	}
	current() {
		return this.string.slice( this.start, this.pos );
	}
	lookAhead( n ) {
		const oracle = this.lineOracle;
		return oracle && oracle.lookAhead( n );
	}
}

/**
 * @typedef {object} mime
 * @property {string} name
 * @property {any}
 */
/**
 * @typedef {object} mode
 * @property {function} startState
 * @property {function} copyState
 * @property {function} token
 * @property {function} blankLine
 */
/**
 * @typedef {function} factory
 * @returns {mode}
 */

// Known modes, by name and by MIME
const modes = {}, /** @type {Object.<string, factory>} */
	mimeModes = {}, /** @type {Object.<string, string>} */
	defaults = {};

/**
 * @param {string} name
 * @param {factory} mode
 */
function defineMode( name, mode ) {
	modes[ name ] = mode;
}

/**
 * @param {string} mime
 * @param {string} spec
 */
function defineMIME( mime, spec ) {
	mimeModes[ mime ] = spec;
}

/**
 * Given a MIME type, a {name, ...options} config object, or a name
 * string, return a copy of the mode config object.
 * @param {?(string|mime)} spec
 * @returns {mime}
 */
function resolveMode( spec ) {
	let found = spec;
	if ( typeof spec === 'string' && spec in mimeModes ) {
		found = mimeModes[ spec ];
	} else if ( spec && typeof spec.name === 'string' && spec.name in mimeModes ) {
		found.name = mimeModes[ spec.name ];
	}
	if ( typeof found === 'string' ) {
		return { name: found };
	}
	return found || { name: 'null' };
}

/**
 * Given a mode spec (anything that resolveMode accepts), find and
 * initialize an actual mode object.
 * @param {?object} options
 * @param {?(string|mime)} spec
 * @returns {mode}
 */
function getMode( options, spec ) {
	const found = resolveMode( spec ), /** @type {mime} */
		mfactory = modes[ found.name ]; /** @type {factory} */
	if ( !mfactory ) {
		return getMode( options, 'text/plain' );
	}
	const modeObj = mfactory( options, found ); /** @type {mode} */
	modeObj.name = spec.name;

	return modeObj;
}

function copyState( mode, state ) {
	if ( state === true ) {
		return true;
	}
	if ( mode.copyState ) {
		return mode.copyState( state );
	}
	return structuredClone( state );
}

function startState( mode, a1, a2 ) {
	return mode.startState ? mode.startState( a1, a2 ) : true;
}

function runMode( string, modespec, callback, options ) {
	let i = 0;
	const mode = getMode( defaults, modespec ),
		lines = string.split( '\n' ),
		state = options && options.state || startState( mode ),
		lineOracle = {
			lookAhead( n ) {
				return lines[ i + n ];
			},
		};
	for ( const e = lines.length; i < e; ++i ) {
		if ( i ) {
			callback( '\n' );
		}
		const stream = new StringStream( lines[ i ], lineOracle );
		if ( !stream.string && mode.blankLine ) {
			mode.blankLine( state );
		}
		while ( !stream.eol() ) {
			const style = mode.token( stream, state );
			callback( stream.current(), style, i, stream.start, state, mode );
			stream.start = stream.pos;
		}
	}
}

// Copy StringStream and mode methods into exports (CodeMirror) object.
const CodeMirror = {
	defaults,
	modes,
	mimeModes,
	defineMode,
	defineMIME,
	getMode,
	copyState,
	startState,
	runMode,
};

// Minimal default mode.
CodeMirror.defineMode( 'null', function () {
	return {
		token( stream ) {
			return stream.skipToEnd();
		},
	};
} );
CodeMirror.defineMIME( 'text/plain', 'null' );

module.exports = CodeMirror;
