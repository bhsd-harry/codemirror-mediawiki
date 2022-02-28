( function ( CodeMirror ) {
	'use strict';

	const permittedHtmlTags = {
			b: true, bdi: true, del: true, i: true, ins: true, img: true,
			u: true, font: true, big: true, small: true, sub: true, sup: true,
			h1: true, h2: true, h3: true, h4: true, h5: true, h6: true, cite: true,
			code: true, em: true, s: true, strike: true, strong: true, tt: true,
			var: true, div: true, center: true, blockquote: true, q: true, ol: true, ul: true,
			dl: true, table: true, caption: true, pre: true, ruby: true, rb: true,
			rp: true, rt: true, rtc: true, p: true, span: true, abbr: true, dfn: true,
			kbd: true, samp: true, data: true, time: true, mark: true, br: true,
			wbr: true, hr: true, li: true, dt: true, dd: true, td: true, th: true,
			tr: true, noinclude: true, includeonly: true, onlyinclude: true, translate: true
		},
		voidHtmlTags = { br: true, hr: true, wbr: true, img: true },
		span = document.createElement( 'span' ), // used for isEntity()
		nsFileRegex = getFileRegex();
	var mwConfig, urlProtocols;

	function getFileRegex() {
		const nsIds = mw.config.get( 'wgNamespaceIds' ),
			nsFile = Object.keys( nsIds ).filter( function ( ns ) {
				return nsIds[ ns ] === 6;
			} ).join( '|' );
		return new RegExp( '^(?:' + nsFile + ')[\\s\\xa0]*:[\\s\\xa0]*', 'i' );
	}

	/**
	 * @typedef Apos
	 * @type {object}
	 * @property {boolean} bold
	 * @property {boolean} italic
	 */

	/**
	 * @typedef state
	 * @type {object}
	 * @property {function} tokenize - current token
	 * @property {Array.<function>} stack - ancestor tokens
	 * @property {Array.<string>} InHtmlTag - ancestor HTML tags
	 * @property {Apos} apos - apostrophe states
	 * @property {Apos} parentApos - parent apostrophe states
	 * @property {Array.<Apos>} aposStack - ancestor apostrophe states
	 * @property {number} nTemplate - ancestor templates
	 * @property {number} nLink - ancestor links
	 * @property {number} nExt - ancestor parser functions
	 * @property {number} nInvisible - ancestor invisible syntax
	 */

	/**
	 * add background
	 */
	function makeLocalStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		var ground = '';
		switch ( state.nTemplate ) {
			case 0:
				break;
			case 1:
				ground += '-template';
				break;
			case 2:
				ground += '-template2';
				break;
			default:
				ground += '-template3';
		}
		switch ( state.nExt ) {
			case 0:
				break;
			case 1:
				ground += '-ext';
				break;
			case 2:
				ground += '-ext2';
				break;
			default:
				ground += '-ext3';
		}
		if ( state.nLink > 0 ) {
			ground += '-link';
		}
		if ( endGround ) {
			state[ endGround ]--;
		}
		return style + ( ground && ' mw' + ground + '-ground' );
	}

	/**
	 * show bold and/or italic font in addition to makeLocalStyle()
	 */
	function makeStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		const tags = state.InHtmlTag.join(),
			strong = state.apos.bold || state.nInvisible === 0 && /\b(?:b|strong)\b/.test( tags ) ? ' strong' : '',
			em = state.apos.italic || state.nInvisible === 0 && /\b(?:i|em)\b/.test( tags ) ? ' em' : '',
			strikethrough = state.nInvisible === 0 && /\b(?:strike|s|del)\b/.test( tags ) ? ' strikethrough' : '';
		return makeLocalStyle( style + strong + em + strikethrough, state, endGround );
	}

	/**
	 * show bold and/or italic font based on both local and parent apostrophe states
	 */
	function makeOrStyle( style, state, endGround ) {
		if ( style === undefined ) {
			return;
		}
		const orState = $.extend( {}, state, { apos: {
			bold: state.apos.bold || state.parentApos.bold,
			italic: state.apos.italic || state.parentApos.italic
		} } );
		return makeStyle( style, orState, endGround );
	}

	/**
	 * simply eat white spaces without returned styles
	 */
	function eatSpace( stream ) {
		return stream.match( /^[\s\xa0]+/ );
	}

	/**
	 * simply eat HTML entities
	 */
	function eatMnemonic( stream, style, errorStyle ) {
		function isEntity( str ) {
			span.innerHTML = str;
			return span.textContent.length === 1;
		}

		// no dangerous character should appear in results
		const entity = stream.match( /^(?:#x[a-f\d]+|#\d+|[a-z\d]+)/i );
		if ( entity ) {
			const semi = stream.eat( ';' );
			if ( semi && isEntity( '&' + entity[ 0 ] + ';' ) ) {
				return style + ' mw-mnemonic';
			}
			stream.backUp( entity[ 0 ].length + ( semi ? 1 : 0 ) );
		}
		return errorStyle === undefined ? style : errorStyle;
	}

	/**
	 * simply eat until a block ends with specified terminator
	 */
	function eatBlock( style, terminator, makeFunc ) {
		function parser( stream, state ) {
			if ( !stream.skipTo( terminator ) ) {
				stream.skipToEnd();
			} else {
				stream.match( terminator );
				state.tokenize = state.stack.pop();
			}
			return makeFunc( style, state );
		}
		return function ( stream, state ) {
			state.stack.push( state.tokenize );
			state.tokenize = parser;
		};
	}

	/**
	 * eat comment
	 */
	const eatComment = eatBlock( 'mw-comment', '-->', makeLocalStyle );

	/**
	 * simply eat until the end of line
	 */
	function eatEnd( style, makeFunc ) {
		return function ( stream, state ) {
			stream.skipToEnd();
			state.tokenize = state.stack.pop();
			return makeFunc( style, state );
		};
	}

	/**
	 * simply eat characters
	 */
	function eatChars( chars, style, makeFunc, pop ) {
		return function ( stream, state ) {
			if ( pop ) {
				state.tokenize = state.stack.pop();
			}
			for ( var i = 0; i < chars; i++ ) {
				stream.next();
			}
			return makeFunc( style, state );
		};
	}

	/**
	 * eat apostrophes and modify apostrophe-related states
	 */
	function eatApos( style, makeFunc ) {
		return function ( stream, state ) {
			// skip the irrelevant apostrophes ( >5 or =4 )
			if ( stream.match( /^'*(?='{5})/ ) || stream.match( /^'{3}(?!')/, false ) ) {
				return makeFunc( style, state );
			} else if ( stream.match( "''" ) ) { // bold
				state.apos.bold = !state.apos.bold;
				return makeLocalStyle( 'mw-apostrophes', state );
			} else if ( stream.eat( "'" ) ) { // italic
				state.apos.italic = !state.apos.italic;
				return makeLocalStyle( 'mw-apostrophes', state );
			}
			return makeFunc( style, state );
		};
	}

	/**
	 * reset apostrophe states
	 */
	function clearApos( state ) {
		state.aposStack = state.aposStack.map( function () {
			return {};
		} );
		state.apos = {};
	}

	/**
	 * special characters that can start wikitext syntax:
	 * line start : - = # * : ; SPACE {
	 * other      : { & ' ~ _ [ <
	 * details    :
	 * '----'   : <hr> (line start)
	 * '='      : <h1> ~ <h6> (line start)
	 * #        : <ol> (line start)
	 * *        : <ul> (line start)
	 * ;        : <dt> (line start)
	 * :        : <dd> (line start)
	 * ' '      : <pre> (line start)
	 * '{|'     : <table> (line start)
	 * '{{'     : parser functions and templates
	 * '{{{'    : variables
	 * '&'      : HTML entities
	 * "''"     : <i> <b>
	 * '~~~'    : signature
	 * '__'     : behavior switch
	 * '['      : <a>
	 * '<'      : tags
	 */

	/**
	 * illegal characters in page name
	 * # < > [ ] _ { | }
	 */

	/**
	 * additional illegal characters in file name
	 * / : &
	 */

	/**
	 * function template
	 * 1. stream.sol()
	 * 2. plain text
	 * 3. unique syntax
	 * 4. common wikitext
	 * 5. fallback
	 */

	/**
	 * eat section header when the number of ending characters is already known
	 */
	function eatSectionHeader( count ) {
		return function ( stream, state ) {
			// 1. impossible to be stream.sol()
			if ( stream.match( /^[^{&'~[<]+/ ) ) { // 2. plain text
				if ( stream.eol() ) {
					stream.backUp( count );
					state.tokenize = eatEnd( 'mw-section-header', makeLocalStyle );
				}
				return makeStyle( '', state );
			}
			// 3. no unique syntax
			return eatWikiTextOther( makeStyle, '', '' )( stream, state ); // 4. common wikitext, without fallback
		};
	}

	/**
	 * template variable name
	 * Uncommon but possibly multiline
	 * Unique syntax: |, }}}
	 * Valid wikitext syntax: {{, {{{
	 */
	function inVariable( stream, state ) {
		// 1. nothing happens at stream.sol()
		if ( stream.match( /^[^|}{]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-templatevariable-name', state );
		} else if ( stream.eat( '|' ) ) { // 3. unique syntax: |
			state.tokenize = inVariableDefault( 'mw-templatevariable' );
			state.nInvisible--;
			return makeLocalStyle( 'mw-templatevariable-delimiter', state );
		} else if ( stream.match( '}}}' ) ) { // 3. unique syntax: }}}
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeLocalStyle( 'mw-templatevariable-bracket', state );
		}
		// 4. limited common wikitext: {{, {{{; without fallback
		return eatWikiTextOther( makeLocalStyle, '', 'mw-templatevariable-name' )( stream, state );
	}

	/**
	 * template variable default
	 * Can be multiline, with line-start wikitext syntax valid
	 * Unique syntax: |, }}}
	 * Invalid wikitext syntax: {|
	 */
	function inVariableDefault( style ) {
		return function ( stream, state ) { // 1. stream.sol(), excluding {|
			if ( stream.sol() ) {
				state.apos = {}; // do not change state.aposStack
				if ( /[-=#*:; ]/.test( stream.peek() ) ) {
					return eatWikiTextSol( style )( stream, state );
				}
			}
			if ( stream.match( /^[^|}{&'~_[<]+/ ) ) { // 2. plain text
				return makeStyle( style, state );
			} else if ( stream.eat( '|' ) ) { // 3. unique syntax: | (redundant defaults)
				state.tokenize = inVariableDefault( 'error' );
				return makeLocalStyle( 'error', state );
			} else if ( stream.match( '}}}' ) ) { // 3. unique syntax: }}}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-templatevariable-bracket', state );
			}
			// 4. common wikitext without fallback
			return eatWikiTextOther( makeStyle, style, style )( stream, state );
		};
	}

	/**
	 * parser function name
	 * Should not be multiline
	 * Unique syntax: :, }}
	 * Valid wikitext syntax: {{, {{{
	 */
	function inParserFunctionName( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol(), exit
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			state.nExt--;
			return;
		} else if ( stream.match( /^[^:}{]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-parserfunction-name', state );
		} else if ( stream.match( '}}' ) ) { // 3. unique syntax: }}
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
		} else if ( stream.eat( ':' ) ) { // 3. unique syntax: :
			state.aposStack.push( state.apos );
			state.apos = {};
			state.tokenize = inParserFunctionArguments( false );
			state.nInvisible--;
			return makeLocalStyle( 'mw-parserfunction-delimiter', state );
		} else if ( stream.match( '{{', false ) ) { // 4. limited common wikitext: {{, {{{
			return eatWikiTextOther( makeLocalStyle, '', 'error' )( stream, state );
		}
		stream.next();
		return makeLocalStyle( 'error', state ); // 5. fallback
	}

	/**
	 * parser function argument
	 * Can be multiline; white spaces (including newline) trimmed
	 * Apply local apostrophe states
	 * Unique syntax: |, }}
	 * Invalid wikitext syntax: {|
	 */
	function inParserFunctionArguments( haveEaten ) {
		return function ( stream, state ) {
			if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.apos = {};
				state.tokenize = inParserFunctionArguments( false );
				return makeLocalStyle( 'mw-parserfunction-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*}}/ ) ) { // 3. unique syntax: }}
				state.tokenize = state.stack.pop();
				state.apos = state.aposStack.pop();
				return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
			} else if ( stream.sol() ) { // 1. stream.sol()
				clearApos( state ); // may be wrong if no non-whitespace characters eaten, but who knows?
				if ( ( haveEaten ? /[-=#*:; ]/ : /[#*:;]/ ).test( stream.peek() ) ) {
					return eatWikiTextSol( 'mw-parserfunction' )( stream, state );
				}
			}
			const mt = stream.match( /^[^|}&<[{~_']+/ );
			if ( mt ) { // 2. plain text
				if ( !haveEaten && /[^\s\xa0]/.test( mt[ 0 ] ) ) {
					state.tokenize = inParserFunctionArguments( true );
				}
				return makeStyle( 'mw-parserfunction', state );
			} else if ( !haveEaten && !stream.match( '<!--', false ) ) {
				state.tokenize = inParserFunctionArguments( true );
			}
			// 4. common wikitext without fallback
			return eatWikiTextOther( makeStyle, 'mw-parserfunction', 'mw-parserfunction' )( stream, state );
		};
	}

	/**
	 * eat general page name without syntax details
	 * @param {RegExp} regex - regex for plain text; must exclude [&#<~>[\]{}|]
	 * @param {Object.<'haveEaten', boolean>} option
	 * @return {(string|undefined)}
	 */
	function eatPageName( regex, makeFunc, style, option ) {
		return function ( stream, state ) {
			// 1. not handling stream.sol() here
			if ( eatSpace( stream ) ) { // 2. plain text
				return makeFunc( style + ( option.haveEaten && !stream.eol() ? ' mw-pagename' : '' ), state );
			} else if ( stream.match( regex ) ) { // 2. plain text
				option.haveEaten = true;
				return makeFunc( style + ' mw-pagename', state );
			} else if ( stream.match( '<!--' ) ) { // 4. common wikitext: <!--
				return eatComment( stream, state );
			} else if ( stream.match( /^~{3,5}/ ) ) { // 4. common wikitext: ~~~
				return makeFunc( 'error', state );
			} else if ( stream.match( /^(?:[&~]|{{)/, false ) ) { // 4. common wikitext: &, {{, {{{
				option.haveEaten = true;
				const defaultStyle = style + ' mw-pagename',
					ampStyle = option.ampStyle === undefined ? defaultStyle : option.ampStyle;
				return eatWikiTextOther( makeFunc, defaultStyle, 'error', ampStyle )( stream, state );
			}
			stream.next(); // 5. fallback
			return makeFunc( 'error', state );
		};
	}

	/**
	 * template page name
	 * Can be multiline, if the next line starts with '|' or '}}'
	 * Unique syntax: |, }}
	 */
	function eatTemplatePageName( option ) {
		return function ( stream, state ) {
			if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.aposStack.push( state.apos );
				state.apos = {};
				state.tokenize = eatTemplateArgument( true, false );
				state.nInvisible--;
				return makeLocalStyle( 'mw-template-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*}}/ ) ) { // 3. unique syntax: }}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
			} else if ( stream.sol() ) { // 1. stream.sol()
				// @todo error message
				state.nTemplate--;
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return;
			}
			// 2. plain text; 4. common wikitext; 5. fallback
			const style = eatPageName( /^[^\s\xa0|}&#<~>[\]{]+/, makeLocalStyle, 'mw-template-name', option )( stream, state );
			if ( option.haveEaten ) {
				state.tokenize = eatTemplatePageName( option );
			}
			return style;
		};
	}

	/**
	 * template argument
	 * Can be multiline; white spaces (including newline) trimmed
	 * Apply local apostrophe states
	 * Unique syntax: =, |, }}
	 * Invalid wikitext syntax: {|, =
	 */
	function eatTemplateArgument( expectArgName, haveEaten ) {
		return function ( stream, state ) {
			if ( expectArgName && stream.match( /^[^=|}{]*=/ ) ) { // 3. unique syntax: =
				state.tokenize = eatTemplateArgument( false, false );
				return makeLocalStyle( 'mw-template-argument-name', state );
			} else if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.apos = {};
				state.tokenize = eatTemplateArgument( true, false );
				return makeLocalStyle( 'mw-template-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*}}/ ) ) { // 3. unique syntax: }}
				state.tokenize = state.stack.pop();
				state.apos = state.aposStack.pop();
				return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
			} else if ( stream.sol() ) { // 1. stream.sol()
				clearApos( state ); // may be wrong if no non-whitespace characters eaten, but who knows?
				if ( ( haveEaten ? /[-#*:; ]/ : /[#*:;]/ ).test( stream.peek() ) ) {
					return eatWikiTextSol( 'mw-template' )( stream, state );
				}
			}
			const ch = stream.peek();
			if ( /[^|}&<[{~_']/.test( ch ) ) { // 2. plain text
				if ( !haveEaten && /[^\s\xa0]/.test( ch ) ) {
					state.tokenize = eatTemplateArgument( expectArgName, true );
				}
				return eatFreeExternalLinkProtocol( 'mw-template', '}|' )( stream, state );
			} else if ( !haveEaten && !stream.match( '<!--', false ) ) {
				state.tokenize = eatTemplateArgument( expectArgName, true );
			}
			// 4. common wikitext without fallback
			return eatWikiTextOther( makeStyle, 'mw-template', 'mw-template' )( stream, state );
		};
	}

	/**
	 * eat already known external link protocol
	 * Cannot be multiline
	 */
	function eatExternalLinkProtocol( chars ) {
		return function ( stream, state ) {
			const style = eatChars( chars, 'mw-extlink-protocol', makeLocalStyle );
			if ( stream.eol() ) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
			} else {
				state.tokenize = inExternalLink;
				state.nInvisible++;
			}
			return style;
		};
	}

	/**
	 * external link url without protocol
	 * Cannot be multiline
	 * Unique syntax: SPACE, ], '', [, [[, ~~~, <, >
	 * Valid wikitext syntax: &, {{, {{{
	 */
	function inExternalLink( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			state.nInvisible--;
		} else if ( stream.match( /^[^\s\xa0\]'~[<{&]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-extlink', state );
		} else if ( stream.match( /^[\s\xa0]*]/ ) ) { // 3. unique syntax: ]
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		} else if ( eatSpace( stream ) ) { // 3. unique syntax: SPACE
			state.tokenize = inExternalLinkText;
			state.nInvisible--;
			return makeLocalStyle( '', state );
		} else if ( stream.match( /^~{3,5}/ ) ) { // 3. unique syntax: ~~~
			state.nLink--;
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeStyle( 'error', state );
		} else if ( stream.match( '[[', false ) ) { // 3. unique syntax: [[
			state.nLink--;
			state.tokenize = state.stack.pop();
			state.nInvisible--;
		} else if ( stream.match( /^(?:[[<>]|'')/, false ) ) { // 3. unique syntax: [, <, >, ''
			state.tokenize = inExternalLinkText;
			state.nInvisible--;
		} else { // 4. limited common wikitext: &, {{, {{{; without fallback
			return eatWikiTextOther( makeLocalStyle, 'mw-extlink', 'mw-extlink' )( stream, state );
		}
	}

	/**
	 * external link text
	 * Cannot be multiline
	 * Unique syntax: ], ~~~, [[
	 * Invalid wikitext syntax: [
	 */
	function inExternalLinkText( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return;
		} else if ( stream.match( /^[^\]~[{&'<]+/ ) ) { // 2. plain text
			return makeStyle( 'mw-extlink-text', state );
		} else if ( stream.eat( ']' ) ) { // 3. unique syntax: ]
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		} else if ( stream.match( /^(?:~{3,4}(?!~)|\[\[)/, false ) ) { // 3. unique syntax: ~~~, [[
			state.nLink--;
			state.tokenize = state.stack.pop();
		} else if ( stream.eat( '[' ) ) { // 4. invalid wikitext: [
			return makeStyle( 'mw-extlink-text', state );
		}
		// 4. common wikitext without fallback
		return eatWikiTextOther( makeStyle, 'mw-extlink-text', 'mw-extlink-text' )( stream, state );
	}

	/**
	 * eat already known file link namespace
	 */
	function inFileLinkNamespace( chars ) {
		return function ( stream, state ) {
			state.tokenize = inFileLink;
			return eatChars( chars, 'mw-link-pagename mw-pagename', makeLocalStyle )( stream, state );
		};
	}

	/**
	 * file link
	 * Cannot be multiline
	 * Unique syntax: |, ]]
	 */
	function inFileLink( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return;
		} else if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
			if ( state.nLink === 1 ) {
				state.parentApos = state.apos;
				state.aposStack.push( state.apos );
				state.apos = {};
			}
			state.tokenize = eatFileLinkText;
			state.nInvisible--;
			return makeLocalStyle( 'mw-link-delimiter', state );
		} else if ( stream.match( /^[\s\xa0]*]]/ ) ) { // 3. unique syntax: ]]
			state.tokenize = state.stack.pop();
			state.nInvisible--;
			return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
		}
		// 2. plain text; 4. common wikitext; 5. fallback
		return eatPageName( /^[^\s\xa0|}&#<~>[\]{/:]+/, makeLocalStyle, 'mw-link-pagename', {
			haveEaten: true,
			ampStyle: 'error'
		} )( stream, state );
	}

	/**
	 * file link text
	 * Can be multiline
	 * Not differentiating parameters, so can be wrong
	 * Unique syntax: |, ]], =
	 * Invalid wikitext syntax: *, #, :, ;, SPACE
	 */
	function eatFileLinkText( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			if ( stream.match( /^(?:-{4}|=|[\s\xa0]*:*[\s\xa0]*{\|)/, false ) ) {
				return eatWikiTextSol( 'mw-link-text' )( stream, state );
			}
		}
		if ( stream.match( /^[^\]|{&'~[<]+/ ) ) { // 2. plain text
			return makeStyle( 'mw-link-text', state );
		} else if ( stream.match( ']]' ) ) { // 3. unique syntax: ]]
			state.tokenize = state.stack.pop();
			if ( state.nLink === 1 ) {
				state.apos = state.aposStack.pop();
				state.parentApos = {};
			}
			return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
		} else if ( stream.eat( '|' ) ) { // 3. unique syntax: |
			if ( state.nLink === 1 ) {
				state.apos = {};
			}
			return makeLocalStyle( 'mw-link-delimiter', state );
		}
		// 4. common wiki text without fallback
		return eatWikiTextOther( makeStyle, 'mw-link-text', 'mw-link-text' )( stream, state );
	}

	/**
	 * normal internal link
	 * Cannot be multiline
	 * Unique syntax: |, ]], #
	 */
	function inLink( invisible ) {
		const makeFunc = invisible ? makeLocalStyle : makeOrStyle;
		return function ( stream, state ) {
			if ( stream.sol() ) { // 1. stream.sol()
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
				if ( invisible ) {
					state.nInvisible--;
				}
				return;
			}
			if ( stream.match( /^[\s\xa0]*#[\s\xa0]*/ ) ) { // 3. unique syntax: #
				state.tokenize = inLinkToSection( invisible );
				return makeFunc( 'mw-link', state );
			} else if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) { // 3. unique syntax: |
				state.tokenize = eatLinkText;
				state.nInvisible--;
				if ( state.nLink === 1 ) {
					state.parentApos = state.apos;
					state.aposStack.push( state.apos );
					state.apos = {};
				}
				return makeLocalStyle( 'mw-link-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*]]/ ) ) { // 3. unique syntax: ]]
				state.tokenize = state.stack.pop();
				if ( invisible ) {
					state.nInvisible--;
				}
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			// 2. plain text; 4. common wikitext; 5. fallback
			return eatPageName( /^[^\s\xa0|\]#&<~>[{}]+/, makeFunc, 'mw-link-pagename', {} )( stream, state );
		};
	}

	/**
	 * internal link hash
	 * Cannot be multiline
	 * Unique syntax: |, ]]
	 * Valid wikitext syntax: &, {{, {{{, <!--
	 * Invalid wikitext syntax: ~~~, HTML tags, complete extension tags
	 * Invalid characters: { } [ ]
	 */
	function inLinkToSection( invisible ) {
		const makeFunc = invisible ? makeLocalStyle : makeOrStyle;
		return function ( stream, state ) {
			if ( stream.sol() ) { // 1. stream.sol()
				// @todo error message
				state.nLink--;
				state.tokenize = state.stack.pop();
				if ( invisible ) {
					state.nInvisible--;
				}
				return;
			} else if ( stream.match( /^[^|\]{&~<[}]+/ ) ) { // 2. plain text
				return makeFunc( 'mw-link-tosection', state );
			} else if ( stream.eat( '|' ) ) { // 3. unique syntax: |
				state.tokenize = eatLinkText;
				state.nInvisible--;
				if ( state.nLink === 1 ) {
					state.parentApos = state.apos;
					state.aposStack.push( state.apos );
					state.apos = {};
				}
				return makeLocalStyle( 'mw-link-delimiter', state );
			} else if ( stream.match( ']]' ) ) { // 3. unique syntax: ]]
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			} else if ( stream.match( /^(?:&|{{|<!--)/, false ) ) { // 4. limited common wikitext
				return eatWikiTextOther( makeFunc, 'mw-link-tosection', 'mw-link-tosection' )( stream, state );
			}
			const mt = stream.match( /^(<\/?([A-Za-z\d]+)|~{3,5}|[{}[\]])/ );
			if ( mt ) { // 4. invalid syntax or characters: tags, ~~~, {, }, [, ]
				const fullname = mt[ 0 ],
					name = ( mt[ 2 ] || '' ).toLowerCase();
				if ( fullname[ 0 ] === '~' || name in mwConfig.tags || name in permittedHtmlTags ) {
					state.nLink--;
					state.tokenize = state.stack.pop();
					if ( invisible ) {
						state.nInvisible--;
					}
					if ( fullname[ 0 ] === '~' ) {
						return makeFunc( 'error', state );
					}
					stream.backUp( fullname.length );
				} else if ( !name ) {
					return makeFunc( 'error', state );
				}
			} else {
				stream.next();
			}
			return makeFunc( 'mw-link-tosection', state ); // 5. fallback
		};
	}

	/**
	 * internal link text
	 * Can be multiline
	 * Unique syntax: ]]
	 * Invalid wikitext syntax: [, [[, ~~~~, SPACE, #, *, ;, :
	 */
	function eatLinkText( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			if ( stream.match( /^(?:-{4}|=|[\s\xa0]*:*[\s\xa0]*{\|)/, false ) ) {
				return eatWikiTextSol( 'mw-link-text' )( stream, state );
			}
		}
		if ( stream.match( /^(?:[^\][~{&'<]+|\[(?!\[))/ ) ) { // 2. plain text
			return makeOrStyle( 'mw-link-text', state );
		}
		const mt = stream.match( /^(?:]]|\[\[|~{3,4}(?!~))/ );
		if ( mt ) { // 3. unique syntax: ]], [[, ~~~~
			state.tokenize = state.stack.pop();
			if ( state.nLink === 1 ) {
				state.apos = state.aposStack.pop();
				state.parentApos = {};
			}
			if ( mt[ 0 ] === ']]' ) {
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			state.nLink--;
			if ( mt[ 0 ] === '[[' ) {
				stream.backUp( 2 );
				return;
			}
			return makeLocalStyle( 'error', state );
		}
		// 4. limited common wikitext: {{, {{{, &, '', <, ~~~~~
		return eatWikiTextOther( makeOrStyle, 'mw-link-text', 'mw-link-text' )( stream, state );
	}

	/**
	 * simply eat tag attributes if the tag name is not followed by whitespace
	 */
	function eatInvalidTagAttribute( stream, state ) {
		const style = eatBlock( 'error', '>', makeLocalStyle )( stream, state );
		stream.backUp( 1 );
		return style;
	}

	/**
	 * eat already known tag name
	 * @param {string} name - tag name in lower case
	 * @param {boolean} isCloseTag - truly closing tag
	 */
	function eatTagName( name, isCloseTag, isHtmlTag ) {
		return function ( stream, state ) {
			state.nInvisible++;
			const style = eatChars( name.length, isHtmlTag ? 'mw-htmltag-name' : 'mw-exttag-name', makeLocalStyle )( stream, state );
			if ( !eatSpace( stream ) && !stream.eol() && !stream.match( /^\/?>/, false ) ) { // invalid tag syntax
				state.tokenize = eatInvalidTagAttribute;
				state.stack.push( isHtmlTag ? eatHtmlTagAttribute( name, isCloseTag ) : eatExtTagAttribute( name ) );
			} else if ( isHtmlTag ) {
				state.tokenize = eatHtmlTagAttribute( name, isCloseTag );
			} else if ( isCloseTag ) { // extension tag
				state.tokenize = eatChars( 1, 'mw-exttag-bracket', makeLocalStyle, true );
			} else {
				state.tokenize = eatExtTagAttribute( name );
			}
			return style;
		};
	}

	/**
	 * HTML tag attribute
	 * Can be multiline
	 * Unique syntax: >, /, <
	 * Valid wikitext syntax: ~~~, &, {{, {{{, <
	 * @param {boolean} isCloseTag - truly closing
	 */
	function eatHtmlTagAttribute( name, isCloseTag ) {
		const style = 'mw-htmltag-attribute' + ( isCloseTag ? ' error' : '' );
		return function ( stream, state ) {
			// 1. nothings happens at stream.sol()
			if ( stream.match( /^[^>/<{&~]+/ ) ) { // 2. plain text
				return makeLocalStyle( style, state );
			} else if ( stream.eat( '>' ) ) { // 3. unique syntax: >
				if ( !( isCloseTag || name in voidHtmlTags ) ) {
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-htmltag-bracket', state );
			} else if ( stream.match( '/>' ) ) { // 3. unique syntax: />
				if ( !( isCloseTag || name in voidHtmlTags ) ) { // HTML5 standard
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-htmltag-bracket' + ( name in voidHtmlTags ? '' : ' error' ), state );
			} else if ( stream.eat( '<' ) ) { // 3. unique syntax: <
				if ( stream.match( '!--' ) ) {
					return eatComment( stream, state );
				}
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return;
			}
			// 4. limited common wikitext: {{, {{{, &, ~~~; without fallback
			return eatWikiTextOther( makeLocalStyle, style, style )( stream, state );
		};
	}

	/**
	 * extension tag attribute
	 * Can be multiline
	 * Unique syntax: >, /
	 * Valid wikitext syntax: &, {{, {{{
	 */
	function eatExtTagAttribute( name ) {
		return function ( stream, state ) {
			// 1. nothings happens at stream.sol()
			if ( stream.match( /^[^>/{&]+/ ) ) { // 2. plain text
				return makeLocalStyle( 'mw-exttag-attribute', state );
			} else if ( stream.eat( '>' ) ) { // 3. unique syntax: >
				state.extName = name;
				if ( name in mwConfig.tagModes ) {
					state.extMode = CodeMirror.getMode( { mwConfig: mwConfig }, mwConfig.tagModes[ name ] );
					state.extState = CodeMirror.startState( state.extMode );
				}
				state.tokenize = eatExtTagArea( name );
				state.nInvisible--;
				return makeLocalStyle( 'mw-exttag-bracket', state );
			} else if ( stream.match( '/>' ) ) { // 3. unique syntax: />
				state.tokenize = state.stack.pop();
				state.nInvisible--;
				return makeLocalStyle( 'mw-exttag-bracket', state );
			}
			// 4. limited common wikitext: {{, {{{, &; without fallback
			return eatWikiTextOther( makeLocalStyle, 'mw-exttag-attribute', 'mw-exttag-attribute' )( stream, state );
		};
	}

	/**
	 * extension tag area
	 * Can be multiline
	 */
	function eatExtTagArea( name ) {
		return function ( stream, state ) {
			const origString = stream.string,
				from = stream.pos,
				pattern = new RegExp( '</' + name + '[\\s\\xa0]*>', 'i' ),
				m = pattern.exec( stream.string.slice( from ) );

			if ( m ) {
				if ( m.index === 0 ) {
					state.tokenize = eatExtCloseTag( m[ 0 ].length - 3 );
					state.extName = false;
					if ( state.extMode !== false ) {
						state.extMode = false;
						state.extState = false;
					}
					return;
				}
				stream.string = origString.slice( 0, m.index + from ); // inside tag only
			}

			state.stack.push( state.tokenize );
			state.tokenize = eatExtTokens( origString );
		};
	}

	/**
	 * simply eat already known closing extension tag
	 */
	function eatExtCloseTag( chars ) {
		return function ( stream, state ) {
			const style = eatChars( 2, 'mw-exttag-bracket', makeLocalStyle )( stream, state );
			state.tokenize = eatExtCloseTagName( chars );
			state.nInvisible++;
			return style;
		};
	}
	function eatExtCloseTagName( chars ) {
		return function ( stream, state ) {
			const style = eatChars( chars, 'mw-exttag-name', makeLocalStyle )( stream, state );
			state.nInvisible--;
			state.tokenize = eatChars( 1, 'mw-exttag-bracket', makeLocalStyle, true );
			return style;
		};
	}

	/**
	 * extension tag tokens
	 */
	function eatExtTokens( origString ) {
		return function ( stream, state ) {
			var ret = 'mw-exttag';
			if ( state.extMode === false ) {
				stream.skipToEnd();
			} else {
				ret = 'mw-tag-' + state.extName + ' ';
				ret += state.extMode.token( stream, state.extState );
			}
			if ( stream.eol() ) {
				stream.string = origString;
				state.tokenize = state.stack.pop();
			}
			return ( state.extState.makeFunc || makeStyle )( ret, state );
		};
	}

	/**
	 * eat already known tabel start
	 */
	function eatStartTable( stream, state ) {
		const style = eatChars( 2, 'mw-table-bracket', makeLocalStyle );
		eatSpace( stream );
		state.tokenize = inTableDefinition;
		state.nInvisible++;
		return style;
	}

	/**
	 * table definition
	 * Cannot be multiline
	 * Valid wikitext syntax: {{, {{{, &, ~~~, <!--
	 */
	function inTableDefinition( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			state.tokenize = inTable;
			state.nInvisible--;
			return;
		} else if ( stream.match( /^[^{&~<]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-table-definition', state );
		} else if ( stream.match( /^(?:{{|&|~{3}|<!--)/, false ) ) { // 4. limited common wikitext
			return eatWikiTextOther( makeLocalStyle, 'mw-table-definition', 'mw-table-definition' )( stream, state );
		}
		stream.next();
		return makeLocalStyle( 'mw-table-definition', state ); // fallback
	}

	/**
	 * table caption
	 * Can be multiline
	 * Unique syntax: |, ! (not correctly handled now)
	 */
	function inTableCaption( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			clearApos( state );
			if ( stream.match( /^[\s\xa0]*[|!]/, false ) ) {
				state.tokenize = inTable;
				return;
			}
		}
		return eatWikiText( 'mw-table-caption' )( stream, state ); // 4. all common wikitext, without fallback
	}

	/**
	 * general table
	 * Usually at stream.sol(); rarely outside table
	 * Unique syntax: |, |-, |+, |}, !
	 */
	function inTable( stream, state ) {
		if ( stream.sol() ) { // 1. stream.sol()
			eatSpace( stream );
			if ( stream.eat( '|' ) ) {
				if ( stream.eat( '-' ) ) { // 3. unique syntax: |-
					eatSpace( stream );
					state.tokenize = inTableDefinition;
					return makeLocalStyle( 'mw-table-delimiter', state );
				}
				if ( stream.eat( '+' ) ) { // 3. unique syntax: |+
					stream.eatSpace();
					state.tokenize = inTableCaption;
					return makeLocalStyle( 'mw-table-delimiter', state );
				}
				if ( stream.eat( '}' ) ) { // 3. unique syntax: |}
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-table-bracket', state );
				}
				stream.eatSpace();
				state.tokenize = eatTableRow( true, false ); // 3. unique syntax: |
				return makeLocalStyle( 'mw-table-delimiter', state );
			} else if ( stream.eat( '!' ) ) {
				eatSpace( stream );
				state.tokenize = eatTableRow( true, true );
				return makeLocalStyle( 'mw-table-delimiter', state ); // 3. unique syntax: !
			}
		}
		return eatWikiText( '' )( stream, state ); // 4. all common wikitext, without fallback
	}

	/**
	 * table row
	 * Can be multiline
	 * Unique syntax: ||, !!, |
	 */
	function eatTableRow( expectAttr, isHead ) {
		var style = isHead ? 'strong' : '';
		return function ( stream, state ) {
			if ( expectAttr && !stream.match( /^[^|]*(?=\|\||!!|$)/, false ) ) {
				state.nInvisible++;
				style += ' mw-table-definition';
			}
			if ( stream.sol() ) { // 1. stream.sol()
				clearApos( state );
				if ( stream.match( /^[\s\xa0]*[|!]/, false ) ) {
					state.tokenize = inTable;
					return;
				}
			} else if ( stream.match( /^[^'|!{&'~[<_]+/ ) ) { // 2. plain text
				return makeStyle( style, state );
			} else if ( stream.match( '||' ) || isHead && stream.match( '!!' ) ) { // 3. unique syntax: ||, !!
				state.apos = {};
				state.tokenize = eatTableRow( true, isHead );
				return makeLocalStyle( 'mw-table-delimiter', state );
			} else if ( expectAttr && stream.eat( '|' ) ) { // 3. unique syntax: |
				state.tokenize = eatTableRow( false, isHead );
				state.nInvisible--;
				return makeLocalStyle( 'mw-table-delimiter2', state );
			}
			return eatWikiText( style )( stream, state ); // 4. all common wikitext, without fallback
		};
	}

	/**
	 * free external link protocol
	 * Only called after eatWikiTextSol() at stream.sol()
	 * @param {string} restriction - escaped special characters
	 */
	function eatFreeExternalLinkProtocol( style, restriction ) {
		const regex = new RegExp( "^[^\\w{&'~[\\]<>\\x80-\\x9f\\u00a1-\\uffff" + restriction + ']+' );
		return function ( stream, state ) {
			// highlight free external links, bug T108448; cannot be multiline
			if ( !stream.match( '//', false ) && stream.match( urlProtocols ) ) {
				if ( !stream.eol() ) {
					state.stack.push( state.tokenize );
					state.tokenize = eatFreeExternalLink( restriction );
				}
				return makeStyle( 'mw-free-extlink-protocol', state );
			}
			if ( /[\w\x80-\x9f\u00a1-\uffff]/.test( stream.next() ) ) { // \w and non-ascii unicode except \xa0
				stream.match( /^[A-Za-z\d\x80-\x9f\u00a1-\uffff]+/ ); // except '_'
			} else { // ascii except /[\w{}&'~[\]<>|:=#/!]/ and \xa0
				stream.match( regex );
			}
			return makeStyle( style || '', state );
		};
	}

	/**
	 * free external link after protocol
	 * Cannot be multiline
	 * Unique syntax: [, ], <, >, "
	 * Invalid wikitext syntax: ~~~, ''
	 * Valid wikitext syntax: {{, {{{, &
	 * Invalid characters: ! ) \ : ; , . ?
	 */
	function eatFreeExternalLink( restriction ) {
		const regex = new RegExp( '[' + restriction + ']' ),
			plainRegex = new RegExp( '^[^\\s\\xa0[\\]<>"{&\'~!)\\\\:;,.?' + restriction + ']+' );
		return function ( stream, state ) {
			if ( stream.eol() ) { // 1. stream.eol() instead of stream.sol()
				// @todo error message
				state.tokenize = state.stack.pop();
				return;
			} else if ( regex.test( stream.peek() ) || stream.match( /^(?:[[\]<>"]|~{3}|'')/, false ) ) {
				// 3. unique syntax: [, ], <, >, "; 4. invalid common wikitext: ~~~, ''
				state.tokenize = state.stack.pop();
				return;
			} else if ( stream.match( plainRegex ) ) { // 2. plain text
				return makeStyle( 'mw-free-extlink', state );
			} else if ( /[{&]/.test( stream.peek() ) ) { // 4. limited common wikitext: {{, {{{, &
				return eatWikiTextOther( makeStyle, 'mw-free-extlink', 'mw-free-extlink' )( stream, state );
			} else if ( stream.match( /[!)\\:;,.?]*(?=[\s\xa0]|$)/, false ) ) { // 3. invalid characters
				state.tokenize = state.stack.pop();
				return;
			}
			stream.next();
			return makeStyle( 'mw-free-extlink', state ); // 5. fallback
		};
	}

	/**
	 * common wikitext syntax at start of line
	 * Eat at least one character
	 * @param {(string|undefined)} style - Default style
	 * @returns {(string|undefined)}
	 */
	function eatWikiTextSol( style ) {
		return function ( stream, state ) {
			const ch = stream.next();
			switch ( ch ) {
				case '-':
					if ( stream.match( /^-{3,}/ ) ) {
						return 'mw-hr'; // has own background
					}
					break;
				case '=': {
					const tmp = stream.match( /^(={0,5})(.+?(=\1[\s\xa0]*))$/ );
					if ( tmp ) {
						stream.backUp( tmp[ 2 ].length );
						state.stack.push( state.tokenize );
						state.tokenize = eatSectionHeader( tmp[ 3 ].length );
						return makeLocalStyle(
							'mw-section-header line-cm-mw-section-' + ( tmp[ 1 ].length + 1 ),
							state
						);
					}
					break;
				}
				case '*':
				case '#':
				case ';': {
					const mt = stream.match( /^[*#;:]*/ );
					if ( ch === ';' || /;/.test( mt[ 0 ] ) ) {
						state.apos.bold = true;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ':': {
					if ( stream.match( /^:*[\s\xa0]*(?={\|)/ ) ) { // Highlight indented tables :{|, bug T108454
						state.stack.push( state.tokenize );
						state.tokenize = eatStartTable;
						return makeLocalStyle( 'mw-list', state );
					}
					const mt = stream.match( /^[*#;:]*/ );
					if ( /;/.test( mt[ 0 ] ) ) {
						state.apos.bold = true;
					}
					return makeLocalStyle( 'mw-list', state );
				}
				case ' ': {
					const mt = stream.match( /^[\s\xa0]*(:*)[\s\xa0]*(?={\|)/ );
					if ( mt ) { // Leading spaces is the correct syntax for a table, bug T108454
						if ( mt[ 1 ] ) {
							state.stack.push( state.tokenize );
							state.tokenize = eatStartTable;
							return makeLocalStyle( 'mw-list', state );
						}
						stream.eat( '{' );
					} else {
						return 'mw-skipformatting'; // has own background
					}
					// fall through
				}
				case '{':
					if ( stream.eat( '|' ) ) {
						eatSpace( stream );
						state.stack.push( state.tokenize );
						state.tokenize = inTableDefinition;
						return makeLocalStyle( 'mw-table-bracket', state );
					}
			}
			return makeLocalStyle( style, state );
		};
	}

	/**
	 * common wikitext syntax not at start of line
	 * Eat at least one character
	 * @param {function} makeFunc
	 * @param {(string|undefined)} style - Default style, only for &, ', ~, _
	 * @param {(string|undefined)} errorStyle - Error style, only for [, {, <
	 * @param {(string|undefined)} ampStyle - Special style for &, default as style
	 * @returns {(string|undefined)}
	 */
	function eatWikiTextOther( makeFunc, style, errorStyle, ampStyle ) {
		return function ( stream, state ) {
			const ch = stream.next();
			switch ( ch ) {
				case '&':
					return makeFunc( eatMnemonic( stream, style, ampStyle ), state );
				case "'":
					return eatApos( style, makeFunc )( stream, state );
				case '[': {
					if ( stream.eat( '[' ) ) { // Link Example: [[ Foo | Bar ]]
						eatSpace( stream );
						if ( /[^\]|[<>{}]/.test( stream.peek() ) ) { // ignore invalid link
							state.nLink++;
							state.stack.push( state.tokenize );
							const mt = stream.match( nsFileRegex, false );
							if ( mt ) {
								state.tokenize = inFileLinkNamespace( mt[ 0 ].length );
								state.nInvisible++;
							} else if ( stream.match( /^[^\]]*\|/, false ) ) {
								state.tokenize = inLink( true );
								state.nInvisible++;
							} else {
								state.tokenize = inLink( false );
							}
							return makeLocalStyle( 'mw-link-bracket', state );
						}
					} else {
						const mt = stream.match( urlProtocols, false );
						if ( mt ) {
							state.nLink++;
							state.stack.push( state.tokenize );
							state.tokenize = eatExternalLinkProtocol( mt[ 0 ].length );
							return makeLocalStyle( 'mw-extlink-bracket', state );
						}
					}
					break;
				}
				case '{': {
					// Template parameter (skip parameters inside a template transclusion, Bug: T108450)
					if ( !stream.match( '{{{{', false ) && stream.match( '{{' ) ) {
						eatSpace( stream );
						state.stack.push( state.tokenize );
						state.nInvisible++;
						state.tokenize = inVariable;
						return makeLocalStyle( 'mw-templatevariable-bracket', state );
					} else if ( stream.match( /^{[\s\xa0]*/ ) ) {
						state.nInvisible++;
						if ( stream.peek() === '#' ) { // Parser function
							state.nExt++;
							state.stack.push( state.tokenize );
							state.tokenize = inParserFunctionName;
							return makeLocalStyle( 'mw-parserfunction-bracket', state );
						}
						// Check for parser function without '#'
						const name = stream.match( /^([^\s\xa0}{:]+)(:|[\s\xa0]*)(}}?)?(.)?/, false );
						if ( name ) {
							if ( ( name[ 2 ] === ':' || name[ 3 ] === '}}' || name[ 3 ] === '}' && name[ 4 ] === undefined )
								&& ( name[ 1 ].toLowerCase() in mwConfig.functionSynonyms[ 0 ] || name[ 1 ] in mwConfig.functionSynonyms[ 1 ] )
							) {
								state.nExt++;
								state.stack.push( state.tokenize );
								state.tokenize = inParserFunctionName;
								return makeLocalStyle( 'mw-parserfunction-bracket', state );
							}
						}
						// Template
						state.nTemplate++;
						state.stack.push( state.tokenize );
						state.tokenize = eatTemplatePageName( { haveEaten: false } );
						return makeLocalStyle( 'mw-template-bracket', state );
					}
					break;
				}
				case '<': {
					if ( stream.match( '!--' ) ) { // comment
						return eatComment( stream, state );
					}
					const isCloseTag = Boolean( stream.eat( '/' ) ),
						name = stream.match( /^[A-Za-z\d]+/, false ); // HTML5 standard
					if ( name ) {
						var tagname = name[ 0 ].toLowerCase();
						if ( tagname in mwConfig.tags ) { // extension tag
							if ( isCloseTag === true ) {
								// @todo message
								return makeLocalStyle( 'error', state );
							}
							state.stack.push( state.tokenize );
							state.tokenize = eatTagName( tagname, isCloseTag, false );
							return makeLocalStyle( 'mw-exttag-bracket', state );
						} else if ( tagname in permittedHtmlTags ) { // Html tag
							if ( isCloseTag === true ) {
								if ( tagname !== state.InHtmlTag[ state.InHtmlTag.length - 1 ] ) {
									// @todo message
									return makeLocalStyle( 'error', state );
								}
								state.InHtmlTag.pop();
							}
							state.stack.push( state.tokenize );
							state.tokenize = eatTagName( tagname, isCloseTag, true );
							return makeLocalStyle( 'mw-htmltag-bracket', state );
						}
					}
					break;
				}
				case '~':
					if ( stream.match( /^~{2,4}/ ) ) {
						return 'mw-signature'; // has own background
					}
					return makeFunc( style, state );
				case '_': {
					var tmp = 1;
					while ( stream.eat( '_' ) ) { // Optimize processing of many underscore symbols
						tmp++;
					}
					if ( tmp > 2 ) { // Many underscore symbols
						if ( !stream.eol() ) {
							// Leave last two underscore symbols for processing again in next iteration
							stream.backUp( 2 );
						}
					} else if ( tmp === 2 ) { // Check on double underscore Magic Word
						const name = stream.match( /^[^\s\xa0{}&'~[\]<>|:]+?__/ );
						if ( name ) {
							const varname = '__' + name[ 0 ];
							if ( varname.toLowerCase() in mwConfig.doubleUnderscore[ 0 ] || varname in mwConfig.doubleUnderscore[ 1 ] ) {
								return 'mw-doubleUnderscore'; // has own background
							} else if ( !stream.eol() ) {
								// Leave last two underscore symbols for processing again in next iteration
								stream.backUp( 2 );
							}
						}
					}
					return makeFunc( style, state );
				}
			}
			return makeFunc( errorStyle, state );
		};
	}

	/**
	 * eat general wikitext
	 * 1. eatWikiTextSol() if necessary
	 * 2. eatWikiTextOther()
	 * 3. eat free external link
	 * 4. eat plain text which does not interfere with free external links
	 */
	function eatWikiText( style ) {
		return function ( stream, state ) {
			var result;

			if ( stream.sol() ) {
				clearApos( state );
				result = eatWikiTextSol()( stream, state );
				if ( result !== undefined ) {
					return result;
				}
				stream.backUp( 1 );
			}

			result = eatWikiTextOther( makeStyle )( stream, state );
			if ( result !== undefined ) {
				return result;
			}
			stream.backUp( 1 );

			return eatFreeExternalLinkProtocol( style, '' )( stream, state );
		};
	}

	/**
	 * eat <pre>
	 * Unique syntax: <nowiki>
	 * Valid wikitext syntax: &
	 */
	function eatPre( stream, state ) {
		if ( stream.match( /^[^&<]+/ ) ) { // 2. plain text
			return '';
		} else if ( stream.eat( '<' ) ) { // 3. unique syntax: <nowiki> and </nowiki>
			if ( !state.nowiki && stream.match( 'nowiki>' ) || state.nowiki && stream.match( '/nowiki>' ) ) {
				state.nowiki = !state.nowiki;
				return 'mw-comment';
			}
			return '';
		}
		stream.next(); // 4. common wikitext: &; no fallback
		return eatMnemonic( stream, '' );
	}

	/**
	 * eat <nowiki>
	 * Valid wikitext syntax: &
	 */
	function eatNowiki( stream ) {
		if ( stream.match( /^[^&]+/ ) ) { // 2. plain text
			return '';
		}
		stream.next(); // 4. common wikitext: &; no fallback
		return eatMnemonic( stream, '' );
	}

	CodeMirror.defineMode( 'mediawiki', function ( config /* , parserConfig */ ) {
		mwConfig = config.mwConfig;
		urlProtocols = new RegExp( '^(?:' + mwConfig.urlProtocols + ')', 'i' );

		return {
			startState: function () {
				return {
					tokenize: eatWikiText(),
					stack: [], InHtmlTag: [],
					apos: {}, parentApos: {}, aposStack: [],
					extName: false, extMode: false, extState: false,
					nTemplate: 0, nLink: 0, nExt: 0, nInvisible: 0
				};
			},
			copyState: function ( state ) {
				return {
					tokenize: state.tokenize,
					stack: state.stack.concat( [] ),
					InHtmlTag: state.InHtmlTag.concat( [] ),
					apos: state.apos,
					parentApos: state.parentApos,
					aposStack: state.aposStack.concat( [] ),
					extName: state.extName,
					extMode: state.extMode,
					extState: state.extMode !== false && CodeMirror.copyState( state.extMode, state.extState ),
					nTemplate: state.nTemplate,
					nLink: state.nLink,
					nExt: state.nExt,
					nInvisible: state.nInvisible
				};
			},
			token: function ( stream, state ) {
				return state.tokenize( stream, state );
			},
			blankLine: function ( state ) {
				if ( state.extName ) {
					if ( state.extMode ) {
						var ret = '';
						if ( state.extMode.blankLine ) {
							ret = ' ' + state.extMode.blankLine( state.extState );
						}
						return 'line-cm-mw-tag-' + state.extName + ret;
					}
					return 'line-cm-mw-exttag';
				}
			}
		};
	} );

	CodeMirror.defineMIME( 'text/mediawiki', 'mediawiki' );

	CodeMirror.defineMode( 'mw-tag-pre', function ( /* config, parserConfig */ ) {
		return {
			startState: function () {
				return {};
			},
			token: eatPre
		};
	} );

	CodeMirror.defineMode( 'mw-tag-nowiki', function ( /* config, parserConfig */ ) {
		return { token: eatNowiki };
	} );
}( CodeMirror ) );
