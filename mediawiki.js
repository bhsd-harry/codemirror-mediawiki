( function ( CodeMirror ) {
	'use strict';

	var permittedHtmlTags = {
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
		nsFileRegex = getFileRegex(),
		mwConfig, urlProtocols;

	function getFileRegex() {
		var nsIds = mw.config.get( 'wgNamespaceIds' ),
			nsFile = Object.keys( nsIds ).filter( function ( ns ) {
				return nsIds[ ns ] === 6;
			} ).join( '|' );
		return new RegExp( '^(?:' + nsFile + ')[\\s\\xa0]*:', 'i' );
	}

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
		return makeLocalStyle(
			style + ( state.apos.bold ? ' strong' : '' ) + ( state.apos.italic ? ' em' : '' ),
			state, endGround
		);
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
	function eatMnemonic( stream, style ) {
		function isEntity( str ) {
			span.innerHTML = str;
			return span.textContent.length === 1;
		}

		// no dangerous character should appear in results
		var entity = stream.match( /^(?:#x[a-fA-F\d]+|#\d+|[a-zA-Z\d]+)/ );
		if ( entity && stream.eat( ';' ) && isEntity( '&' + entity[ 0 ] + ';' ) ) {
			return style + ' mw-mnemonic';
		}
		return style;
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
			return parser( stream, state );
		};
	}

	/**
	 * eat comment
	 */
	var eatComment = eatBlock( 'mw-comment', '-->', makeLocalStyle );

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
	function eatChars( chars, style, makeFunc ) {
		return function ( stream, state ) {
			state.tokenize = state.stack.pop();
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
	 * / > < : &
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
			if ( stream.match( /^[^{&'~_[<]+/ ) ) { // 2. plain text
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
			return makeLocalStyle( 'mw-templatevariable-delimiter', state );
		} else if ( stream.match( '}}}' ) ) { // 3. unique syntax: }}}
			state.tokenize = state.stack.pop();
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
			state.nExt--;
			return;
		} else if ( stream.match( /^[^:}{]+/ ) ) { // 2. plain text
			return makeLocalStyle( 'mw-parserfunction-name', state );
		} else if ( stream.match( '}}' ) ) { // 3. unique syntax: }}
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
		} else if ( stream.eat( ':' ) ) { // 3. unique syntax: :
			state.aposStack.push( state.apos );
			state.apos = {};
			state.tokenize = inParserFunctionArguments( false );
			return makeLocalStyle( 'mw-parserfunction-delimiter', state );
		} else if ( stream.match( '{{', false ) ) { // 4. limited common wikitext: {{, {{{
			return eatWikiTextOther( makeLocalStyle, '', 'error' )( stream, state );
		}
		// 5. fallback
		stream.next();
		return makeLocalStyle( 'error', state );
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
			var mt = stream.match( /^[^|}&<[{~_']+/ );
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
	 * @param {RegExp} regex - regex for plain text; must exclude [&#<>[\]{}|]
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
			} else if ( stream.match( /^(?:&|{{)/, false ) ) { // 4. common wikitext: &, {{, {{{
				option.haveEaten = true;
				return eatWikiTextOther( makeFunc, style + 'mw-pagename', 'error' )( stream, state );
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
				return makeLocalStyle( 'mw-template-delimiter', state );
			} else if ( stream.match( /^[\s\xa0]*}}/ ) ) { // 3. unique syntax: }}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
			} else if ( stream.sol() ) { // 1. stream.sol()
				// @todo error message
				state.nTemplate--;
				state.tokenize = state.stack.pop();
				return;
			}
			// 2. plain text; 4. common wikitext; 5. fallback
			var style = eatPageName( /^[^\s\xa0|}&#<>[\]{]+/, makeLocalStyle, 'mw-template-name', option )( stream, state );
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
			var mt = stream.match( /^[^|}&<[{~_']+/ );
			if ( mt ) { // 2. plain text
				if ( !haveEaten && /[^\s\xa0]/.test( mt[ 0 ] ) ) {
					state.tokenize = eatTemplateArgument( expectArgName, true );
				}
				return makeStyle( 'mw-template', state );
			} else if ( !haveEaten && !stream.match( '<!--', false ) ) {
				state.tokenize = eatTemplateArgument( expectArgName, true );
			}
			// 4. common wikitext without fallback
			return eatWikiTextOther( makeStyle, 'mw-template', 'mw-template' )( stream, state );
		};
	}

	function eatExternalLinkProtocol( chars ) {
		return function ( stream, state ) {
			for ( var i = 0; i < chars; i++ ) {
				stream.next();
			}
			if ( stream.eol() ) {
				state.nLink--;
				// @todo error message
				state.tokenize = state.stack.pop();
			} else {
				state.tokenize = inExternalLink;
			}
			return makeLocalStyle( 'mw-extlink-protocol', state );
		};
	}

	function inExternalLink( stream, state ) {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return;
		}
		if ( stream.match( /^[\s\xa0]*]/ ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		}
		if ( stream.eatSpace() ) {
			state.tokenize = inExternalLinkText;
			return makeLocalStyle( '', state );
		}
		if ( stream.match( /^[^\s\xa0\]{&~']+/ ) || stream.eatSpace() ) {
			if ( stream.peek() === "'" ) {
				if ( stream.match( "''", false ) ) {
					state.tokenize = inExternalLinkText;
				} else {
					stream.next();
				}
			}
			return makeLocalStyle( 'mw-extlink', state );
		}
		return eatWikiText( 'mw-extlink' )( stream, state );
	}

	function inExternalLinkText( stream, state ) {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return;
		}
		if ( stream.eat( ']' ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
		}
		if ( stream.match( /^[^'\]{&~<]+/ ) ) {
			return makeStyle( 'mw-extlink-text', state );
		}
		return eatWikiText( 'mw-extlink-text' )( stream, state );
	}

	function inFileLink( stream, state ) {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return;
		}
		if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) {
			state.tokenize = eatLinkText( state, true );
			return makeLocalStyle( 'mw-link-delimiter', state );
		}
		if ( stream.match( /^[\s\xa0]*]]/ ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
		}
		if ( stream.match( /^[\s\xa0]*[^\s\xa0|&~#<>[\]{}]+/ ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
			return makeLocalStyle( 'mw-link-pagename mw-pagename', state );
		} else if ( !stream.match( '{{', false ) && stream.eat( /[#<>[\]{}]/ ) ) {
			return makeLocalStyle( 'error', state );
		}
		return eatWikiText( 'mw-link-pagename mw-pagename' )( stream, state );
	}

	function inLink( stream, state ) {
		if ( stream.sol() ) {
			state.nLink--;
			// @todo error message
			state.tokenize = state.stack.pop();
			return;
		}
		var makeFunc = stream.match( /^[\s\xa0]*[^\]]+\|/, false ) ? makeLocalStyle : makeStyle;
		if ( stream.match( /^[\s\xa0]*#[\s\xa0]*/ ) ) {
			state.tokenize = inLinkToSection( makeFunc );
			return makeFunc( 'mw-link', state );
		}
		if ( stream.match( /^[\s\xa0]*\|[\s\xa0]*/ ) ) {
			state.tokenize = eatLinkText( state );
			return makeLocalStyle( 'mw-link-delimiter', state );
		}
		if ( stream.match( /^[\s\xa0]*]]/ ) ) {
			state.tokenize = state.stack.pop();
			return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
		}
		if ( stream.match( /^[\s\xa0]*[^\s\xa0|&~#<>[\]{}]+/ ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
			return makeFunc( 'mw-link-pagename mw-pagename', state );
		} else if ( !stream.match( '{{', false ) && stream.eat( /[<>[\]{}]/ ) ) {
			return makeLocalStyle( 'error', state );
		}
		return eatWikiText( 'mw-link-pagename mw-pagename' )( stream, state );
	}

	function inLinkToSection( makeFunc ) {
		return function ( stream, state ) {
			if ( stream.sol() ) {
				// @todo error message
				state.nLink--;
				state.tokenize = state.stack.pop();
				return;
			}
			if ( stream.match( /^[^|\]&~{}]+/ ) ) { // FIXME '{{' brokes Link, sample [[z{{page]]
				return makeFunc( 'mw-link-tosection', state );
			}
			if ( stream.eat( '|' ) ) {
				state.tokenize = eatLinkText( state );
				return makeLocalStyle( 'mw-link-delimiter', state );
			}
			if ( stream.match( ']]' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			return eatWikiText( 'mw-link-tosection' )( stream, state );
		};
	}

	function eatLinkText( stateObj, isFile ) {
		stateObj.aposStack.push( stateObj.apos );
		if ( stateObj.nLink < 2 ) {
			stateObj.apos = {};
		}
		return function ( stream, state ) {
			if ( stream.match( ']]' ) ) {
				state.tokenize = state.stack.pop();
				if ( stateObj.nLink < 2 ) {
					state.apos = state.aposStack.pop();
				}
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			if ( isFile && stream.eat( '|' ) ) {
				return makeLocalStyle( 'mw-link-delimiter', state );
			}
			if ( stream.eat( "'" ) ) {
				return eatApos( 'mw-link-text', makeStyle )( stream, state );
			}
			var regex = isFile ? /^[^'\]{&~<|[]+/ : /^[^'\]{&~<]+/;
			if ( stream.match( regex ) ) {
				return makeStyle( 'mw-link-text', state );
			}
			return eatWikiText( 'mw-link-text' )( stream, state );
		};
	}

	function eatTagName( chars, isCloseTag, isHtmlTag ) {
		return function ( stream, state ) {
			var name = '';
			for ( var i = 0; i < chars; i++ ) {
				name += stream.next();
			}
			name = name.toLowerCase();
			stream.eatSpace();

			if ( isHtmlTag ) {
				state.tokenize = eatHtmlTagAttribute( name, isCloseTag && !( name in voidHtmlTags ) );
				return makeLocalStyle( 'mw-htmltag-name', state );
			} // it is the extension tag
			if ( isCloseTag ) {
				state.tokenize = eatChars( 1, 'mw-exttag-bracket', makeLocalStyle );
			} else {
				state.tokenize = eatExtTagAttribute( name );
			}
			return makeLocalStyle( 'mw-exttag-name', state );
		};
	}

	function eatHtmlTagAttribute( name, isCloseTag ) {
		var style = 'mw-htmltag-attribute' + ( isCloseTag ? ' error' : '' );
		return function ( stream, state ) {
			if ( stream.match( /^[^>/<{&~]+/ ) ) {
				return makeLocalStyle( style, state );
			}
			if ( stream.eat( '>' ) ) {
				if ( !( name in voidHtmlTags || isCloseTag ) ) {
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-htmltag-bracket', state );
			}
			if ( stream.match( '/>' ) ) {
				if ( !( name in voidHtmlTags || isCloseTag ) ) { // HTML5 standard
					state.InHtmlTag.push( name );
				}
				state.tokenize = state.stack.pop();
				return makeLocalStyle( name in voidHtmlTags ? style : 'mw-htmltag-bracket error', state );
			}
			return eatWikiText( style )( stream, state );
		};
	}

	function eatExtTagAttribute( name ) {
		return function ( stream, state ) {
			if ( stream.match( /^(?:"[^">]*"|'[^'>]*'|[^>/<{&~])+/ ) ) {
				return makeLocalStyle( 'mw-exttag-attribute', state );
			}
			if ( stream.eat( '>' ) ) {
				state.extName = name;
				if ( name in mwConfig.tagModes ) {
					state.extMode = CodeMirror.getMode( { mwConfig: mwConfig }, mwConfig.tagModes[ name ] );
					state.extState = CodeMirror.startState( state.extMode );
				}
				state.tokenize = eatExtTagArea( name );
				return makeLocalStyle( 'mw-exttag-bracket', state );
			}
			if ( stream.match( '/>' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-exttag-bracket', state );
			}
			return eatWikiText( 'mw-exttag-attribute' )( stream, state );
		};
	}

	function eatExtTagArea( name ) {
		return function ( stream, state ) {
			var origString = false,
				from = stream.pos,
				to,
				pattern = new RegExp( '</' + name + '[\\s\\xa0]*>', 'i' ),
				m = pattern.exec( from ? stream.string.slice( from ) : stream.string );

			if ( m ) {
				if ( m.index === 0 ) {
					state.tokenize = eatExtCloseTag( name );
					state.extName = false;
					if ( state.extMode !== false ) {
						state.extMode = false;
						state.extState = false;
					}
					return state.tokenize( stream, state );
				}
				to = m.index + from;
				origString = stream.string;
				stream.string = origString.slice( 0, to );
			}

			state.stack.push( state.tokenize );
			state.tokenize = eatExtTokens( origString );
			return state.tokenize( stream, state );
		};
	}

	function eatExtCloseTag( name ) {
		return function ( stream, state ) {
			stream.next(); // eat <
			stream.next(); // eat /
			state.tokenize = eatTagName( name.length, true, false );
			return makeLocalStyle( 'mw-exttag-bracket', state );
		};
	}

	function eatExtTokens( origString ) {
		return function ( stream, state ) {
			var ret;
			if ( state.extMode === false ) {
				ret = 'mw-exttag';
				stream.skipToEnd();
			} else {
				ret = 'mw-tag-' + state.extName;
				ret += ' ' + state.extMode.token( stream, state.extState, origString === false );
			}
			if ( stream.eol() ) {
				if ( origString !== false ) {
					stream.string = origString;
				}
				state.tokenize = state.stack.pop();
			}
			return makeLocalStyle( ret, state );
		};
	}

	function eatStartTable( stream, state ) {
		stream.match( '{|' );
		stream.eatSpace();
		state.tokenize = inTableDefinition;
		return 'mw-table-bracket';
	}

	function inTableDefinition( stream, state ) {
		if ( stream.sol() ) {
			state.tokenize = inTable;
			return inTable( stream, state );
		}
		return eatWikiText( 'mw-table-definition' )( stream, state );
	}

	function inTableCaption( stream, state ) {
		if ( stream.sol() ) {
			state.apos = {};
			if ( stream.match( /^[\s\xa0]*[|!]/, false ) ) {
				state.tokenize = inTable;
				return inTable( stream, state );
			}
		}
		return eatWikiText( 'mw-table-caption' )( stream, state );
	}

	function inTable( stream, state ) {
		if ( stream.sol() ) {
			stream.eatSpace();
			if ( stream.eat( '|' ) ) {
				if ( stream.eat( '-' ) ) {
					stream.eatSpace();
					state.tokenize = inTableDefinition;
					return makeLocalStyle( 'mw-table-delimiter', state );
				}
				if ( stream.eat( '+' ) ) {
					stream.eatSpace();
					state.tokenize = inTableCaption;
					return makeLocalStyle( 'mw-table-delimiter', state );
				}
				if ( stream.eat( '}' ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-table-bracket', state );
				}
				stream.eatSpace();
				state.tokenize = eatTableRow( true, false );
				return makeLocalStyle( 'mw-table-delimiter', state );
			}
			if ( stream.eat( '!' ) ) {
				stream.eatSpace();
				state.tokenize = eatTableRow( true, true );
				return makeLocalStyle( 'mw-table-delimiter', state );
			}
		}
		return eatWikiText( '' )( stream, state );
	}

	function eatTableRow( expectAttr, isHead ) {
		return function ( stream, state ) {
			if ( stream.sol() ) {
				state.apos = {};
				if ( stream.match( /^[\s\xa0]*[|!]/, false ) ) {
					state.tokenize = inTable;
					return inTable( stream, state );
				}
			} else {
				if ( stream.match( /^[^'|{[<&~!]+/ ) ) {
					return makeStyle( isHead ? 'strong' : '', state );
				}
				if ( stream.match( '||' ) || isHead && stream.match( '!!' ) ) {
					state.apos = {};
					state.tokenize = eatTableRow( true, isHead );
					return makeLocalStyle( 'mw-table-delimiter', state );
				}
				if ( expectAttr && stream.eat( '|' ) ) {
					state.tokenize = eatTableRow( false, isHead );
					return makeLocalStyle( 'mw-table-delimiter2', state );
				}
			}
			return eatWikiText( isHead ? 'strong' : '' )( stream, state );
		};
	}

	function eatFreeExternalLink( stream, state ) {
		if ( stream.eol() ) {
			// @todo error message
		} else if ( stream.match( /^[^\s\xa0{[\]<>~).,']*/ ) ) {
			if ( stream.peek() === '~' ) {
				if ( !stream.match( /^~{3,}/, false ) ) {
					stream.match( /^~*/ );
					return makeStyle( 'mw-free-extlink', state );
				}
			} else if ( stream.peek() === '{' ) {
				if ( !stream.match( '{{', false ) ) {
					stream.next();
					return makeStyle( 'mw-free-extlink', state );
				}
			} else if ( stream.peek() === "'" ) {
				if ( !stream.match( "''", false ) ) {
					stream.next();
					return makeStyle( 'mw-free-extlink', state );
				}
			} else if ( stream.match( /^[).,]+(?=[^\s\xa0{[\]<>~).,])/ ) ) {
				return makeStyle( 'mw-free-extlink', state );
			}
		}
		state.tokenize = state.stack.pop();
		return makeStyle( 'mw-free-extlink', state );
	}

	/**
	 * common wikitext syntax at start of line
	 * Eat at least one character
	 * @param {(string|undefined)} style - Default style
	 * @returns {(string|undefined)}
	 */
	function eatWikiTextSol( style ) {
		return function ( stream, state ) {
			var ch = stream.next(),
				mt;
			switch ( ch ) {
				case '-':
					if ( stream.match( /^-{3,}/ ) ) {
						return 'mw-hr'; // has own background
					}
					break;
				case '=':
					var tmp = stream.match( /^(={0,5})(.+?(=\1[\s\xa0]*))$/ );
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
				case '*':
				case '#':
				case ';':
					mt = stream.match( /^[*#;:]*/ );
					if ( ch === ';' || /;/.test( mt[ 0 ] ) ) {
						state.apos.bold = true;
					}
					return makeLocalStyle( 'mw-list', state );
				case ':':
					if ( stream.match( /^:*[\s\xa0]*(?={\|)/ ) ) { // Highlight indented tables :{|, bug T108454
						state.stack.push( state.tokenize );
						state.tokenize = eatStartTable;
						return makeLocalStyle( 'mw-list', state );
					}
					mt = stream.match( /^[*#;:]*/ );
					if ( /;/.test( mt[ 0 ] ) ) {
						state.apos.bold = true;
					}
					return makeLocalStyle( 'mw-list', state );
				case ' ':
					mt = stream.match( /^[\s\xa0]*(:*)[\s\xa0]*(?={\|)/ );
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
	 * @returns {(string|undefined)}
	 */
	function eatWikiTextOther( makeFunc, style, errorStyle ) {
		return function ( stream, state ) {
			var ch = stream.next(),
				name;
			switch ( ch ) {
				case '&':
					return makeFunc( eatMnemonic( stream, style ), state );
				case "'":
					return eatApos( style, makeFunc )( stream, state );
				case '[':
					if ( stream.eat( '[' ) ) { // Link Example: [[ Foo | Bar ]]
						eatSpace( stream );
						if ( /[^\]|[<>{}]/.test( stream.peek() ) ) { // invalid link
							state.nLink++;
							state.stack.push( state.tokenize );
							state.tokenize = stream.match( nsFileRegex, false ) ? inFileLink : inLink;
							return makeLocalStyle( 'mw-link-bracket', state );
						}
					} else {
						var mt = stream.match( urlProtocols, false );
						if ( mt ) {
							state.nLink++;
							state.stack.push( state.tokenize );
							state.tokenize = eatExternalLinkProtocol( mt[ 0 ].length );
							return makeLocalStyle( 'mw-extlink-bracket', state );
						}
					}
					break;
				case '{':
					// Template parameter (skip parameters inside a template transclusion, Bug: T108450)
					if ( !stream.match( '{{{{', false ) && stream.match( '{{' ) ) {
						eatSpace( stream );
						state.stack.push( state.tokenize );
						state.tokenize = inVariable;
						return makeLocalStyle( 'mw-templatevariable-bracket', state );
					} else if ( stream.match( /^{[\s\xa0]*/ ) ) {
						if ( stream.peek() === '#' ) { // Parser function
							state.nExt++;
							state.stack.push( state.tokenize );
							state.tokenize = inParserFunctionName;
							return makeLocalStyle( 'mw-parserfunction-bracket', state );
						}
						// Check for parser function without '#'
						name = stream.match( /^([^\s\xa0}{:]+)(:|[\s\xa0]*)(}}?)?(.)?/, false );
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
				case '<':
					if ( stream.match( '!--' ) ) { // comment
						return eatComment( stream, state );
					}
					var isCloseTag = Boolean( stream.eat( '/' ) );
					name = stream.match( /^[0-9a-zA-Z]+/, false ); // HTML5 standard
					if ( name ) {
						var tagname = name[ 0 ].toLowerCase();
						if ( tagname in mwConfig.tags ) { // extension tag
							if ( isCloseTag === true ) {
								// @todo message
								return makeLocalStyle( 'error', state );
							}
							state.stack.push( state.tokenize );
							state.tokenize = eatTagName( tagname.length, isCloseTag, false );
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
							// void tags are self-closing
							state.tokenize = eatTagName( tagname.length, isCloseTag || tagname in voidHtmlTags, true );
							return makeLocalStyle( 'mw-htmltag-bracket', state );
						}
					}
					break;
				case '~':
					if ( stream.match( /^~{2,4}/ ) ) {
						return 'mw-signature'; // has own background
					}
					return makeFunc( style, state );
				case '_':
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
						name = stream.match( /^[^\s\xa0{}&'~[\]<>|:]+?__/ );
						if ( name ) {
							var varname = '__' + name[ 0 ];
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

			// highlight free external links, bug T108448
			if ( !stream.match( '//', false ) && stream.match( urlProtocols ) ) {
				state.stack.push( state.tokenize );
				state.tokenize = eatFreeExternalLink;
				return makeLocalStyle( 'mw-free-extlink-protocol', state );
			}
			if ( /[\w\x80-\x9f\u00a1-\uffff]/.test( stream.next() ) ) { // \w and non-ascii unicode except \xa0
				stream.match( /^[A-Za-z0-9\x80-\x9f\u00a1-\uffff]+/ ); // except '_'
			} else { // ascii except /[\w>}[\]<{'|&:~]/ and \xa0
				stream.match( /^[^\w{&'~_[<|:\x80-\x9f\u00a1-\uffff]+/ );
			}
			return makeStyle( style || '', state );
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
					apos: {}, aposStack: [],
					extName: false, extMode: false, extState: false,
					nTemplate: 0, nLink: 0, nExt: 0
				};
			},
			copyState: function ( state ) {
				return {
					tokenize: state.tokenize,
					stack: state.stack.concat( [] ),
					InHtmlTag: state.InHtmlTag.concat( [] ),
					apos: state.apos,
					aposStack: state.aposStack.concat( [] ),
					extName: state.extName,
					extMode: state.extMode,
					extState: state.extMode !== false && CodeMirror.copyState( state.extMode, state.extState ),
					nTemplate: state.nTemplate,
					nLink: state.nLink,
					nExt: state.nExt
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
