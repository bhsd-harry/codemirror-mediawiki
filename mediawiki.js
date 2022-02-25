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
		mwConfig, urlProtocols;

	/**
	 * add background
	 */
	function makeLocalStyle( style, state, endGround ) {
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
		return makeLocalStyle(
			style + ( state.apos.bold ? ' strong' : '' ) + ( state.apos.italic ? ' em' : '' ),
			state, endGround
		);
	}

	function isEntity( str ) {
		span.innerHTML = str;
		return span.textContent.length === 1;
	}

	/**
	 * simply eat HTML entities
	 */
	function eatMnemonic( stream, style ) {
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
	function eatBlock( style, terminator ) {
		return function ( stream, state ) {
			if ( !stream.skipTo( terminator ) ) {
				stream.skipToEnd();
			} else {
				stream.match( terminator );
				state.tokenize = state.stack.pop();
			}
			return makeLocalStyle( style, state );
		};
	}

	/**
	 * simply eat until the end of line
	 */
	function eatEnd( style ) {
		return function ( stream, state ) {
			stream.skipToEnd();
			state.tokenize = state.stack.pop();
			return makeLocalStyle( style, state );
		};
	}

	/**
	 * simply eat one character if it must be there
	 */
	function eatChar( char, style ) {
		return function ( stream, state ) {
			state.tokenize = state.stack.pop();
			stream.eat( char );
			return makeLocalStyle( style, state );
		};
	}

	function eatApos( style ) {
		return function ( stream, state ) {
			// skip the irrelevant apostrophes ( >5 or =4 )
			if ( stream.match( /^'*(?=''''')/ ) || stream.match( /^'''(?!')/, false ) ) {
				return makeStyle( style, state );
			} else if ( stream.match( '\'\'' ) ) { // bold
				state.apos.bold = !state.apos.bold;
				return makeLocalStyle( 'mw-apostrophes', state );
			} else if ( stream.eat( '\'' ) ) { // italic
				state.apos.italic = !state.apos.italic;
				return makeLocalStyle( 'mw-apostrophes', state );
			}
			return makeStyle( style, state );
		};
	}

	function clearApos( state ) {
		state.aposStack = state.aposStack.map( function () {
			return {};
		} );
		state.apos = {};
	}

	CodeMirror.defineMode( 'mediawiki', function ( config /* , parserConfig */ ) {
		mwConfig = config.mwConfig;
		urlProtocols = new RegExp( '^(?:' + mwConfig.urlProtocols + ')', 'i' );

		function eatSectionHeader( count ) {
			return function ( stream, state ) {
				if ( stream.match( /^[^&<[{~_']+/ ) ) {
					if ( stream.eol() ) {
						stream.backUp( count );
						state.tokenize = eatEnd( 'mw-section-header' );
					}
					return makeStyle( '', state );
				}
				return eatWikiText( '' )( stream, state );
			};
		}

		function inVariable( stream, state ) {
			if ( stream.match( /^[^{}|]+/ ) ) {
				return makeLocalStyle( 'mw-templatevariable-name', state );
			} else if ( stream.eat( '|' ) ) {
				state.tokenize = inVariableDefault( state );
				return makeLocalStyle( 'mw-templatevariable-delimiter', state );
			} else if ( stream.match( '}}}' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-templatevariable-bracket', state );
			} else if ( stream.match( '{{', false ) ) {
				return eatWikiText( 'mw-templatevariable-name' )( stream, state );
			}
			stream.next();
			return makeLocalStyle( 'mw-templatevariable-name', state );
		}

		function inVariableDefault( stateObj ) {
			stateObj.aposStack.push( stateObj.apos );
			stateObj.apos = {};
			return function ( stream, state ) {
				if ( stream.sol() ) {
					clearApos( state );
				}
				if ( stream.match( /^[^}&<[{~_']+/ ) ) {
					return makeStyle( 'mw-templatevariable', state );
				} else if ( stream.eat( '\'' ) ) {
					return eatApos( 'mw-templatevariable' )( stream, state );
				} else if ( stream.match( '}}}' ) ) {
					state.tokenize = state.stack.pop();
					state.apos = state.aposStack.pop();
					return makeLocalStyle( 'mw-templatevariable-bracket', state );
				}
				return eatWikiText( 'mw-templatevariable' )( stream, state );
			};
		}

		function inParserFunctionName( stream, state ) {
			if ( stream.match( /^#?[^:{}~|<>[\]#]+/ ) ) {
				return makeLocalStyle( 'mw-parserfunction-name', state );
			} else if ( stream.eat( ':' ) ) {
				state.tokenize = inParserFunctionArguments( state );
				return makeLocalStyle( 'mw-parserfunction-delimiter', state );
			} else if ( stream.match( '}}' ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
			} else if ( stream.match( '{{', false ) ) {
				return eatWikiText( 'mw-parserfunction-name' )( stream, state );
			}
			stream.next();
			return 'error';
		}

		function inParserFunctionArguments( stateObj ) {
			stateObj.aposStack.push( stateObj.apos );
			stateObj.apos = {};
			return function ( stream, state ) {
				if ( stream.sol() ) {
					clearApos( state );
				}
				if ( stream.match( /^[^|}&<[{~_']+/ ) ) {
					return makeStyle( 'mw-parserfunction', state );
				} else if ( stream.eat( '|' ) ) {
					state.apos = {};
					return makeLocalStyle( 'mw-parserfunction-delimiter', state );
				} else if ( stream.match( '}}' ) ) {
					state.tokenize = state.stack.pop();
					state.apos = state.aposStack.pop();
					return makeLocalStyle( 'mw-parserfunction-bracket', state, 'nExt' );
				} else if ( stream.eat( '\'' ) ) {
					return eatApos( 'mw-parserfunction' )( stream, state );
				}
				return eatWikiText( 'mw-parserfunction' )( stream, state );
			};
		}

		function eatTemplatePageName( haveAte ) {
			return function ( stream, state ) {
				if ( stream.match( /^[\s\u00a0]*\|[\s\u00a0]*/ ) ) {
					state.tokenize = eatTemplateArgument( true );
					return makeLocalStyle( 'mw-template-delimiter', state );
				}
				if ( stream.match( /^[\s\u00a0]*\}\}/ ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
				}
				if ( stream.match( /^[\s\u00a0]*<!--.*?-->/ ) ) {
					return makeLocalStyle( 'mw-comment', state );
				}
				if ( haveAte && stream.sol() ) {
					// @todo error message
					state.nTemplate--;
					state.tokenize = state.stack.pop();
					return;
				}
				if ( stream.match( /^[\s\u00a0]*[^\s\u00a0|&~#<>[\]{}]+/ ) ) {
					state.tokenize = eatTemplatePageName( true );
					return makeLocalStyle( 'mw-template-name mw-pagename', state );
				} else if ( stream.eatSpace() ) {
					if ( stream.eol() === true ) {
						return makeLocalStyle( 'mw-template-name', state );
					}
					return makeLocalStyle( 'mw-template-name mw-pagename', state );
				} else if ( !stream.match( '{{', false ) && stream.eat( /[#<>[\]{}]/ ) ) {
					return makeLocalStyle( 'error', state );
				}
				return eatWikiText( 'mw-template-name mw-pagename' )( stream, state );
			};
		}

		function eatTemplateArgument( expectArgName ) {
			return function ( stream, state ) {
				if ( expectArgName && stream.eatWhile( /[^=|}{[<&~]/ ) ) {
					if ( stream.eat( '=' ) ) {
						state.tokenize = eatTemplateArgument( false );
						return makeLocalStyle( 'mw-template-argument-name', state );
					}
					return makeLocalStyle( 'mw-template', state );
				} else if ( stream.eatWhile( /[^|}{[<&~]/ ) ) {
					return makeLocalStyle( 'mw-template', state );
				} else if ( stream.eat( '|' ) ) {
					state.tokenize = eatTemplateArgument( true );
					return makeLocalStyle( 'mw-template-delimiter', state );
				} else if ( stream.match( '}}' ) ) {
					state.tokenize = state.stack.pop();
					return makeLocalStyle( 'mw-template-bracket', state, 'nTemplate' );
				}
				return eatWikiText( 'mw-template' )( stream, state );
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
			if ( stream.match( /^[\s\u00a0]*\]/ ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-extlink-bracket', state, 'nLink' );
			}
			if ( stream.eatSpace() ) {
				state.tokenize = inExternalLinkText;
				return makeLocalStyle( '', state );
			}
			if ( stream.match( /^[^\s\u00a0\]{&~']+/ ) || stream.eatSpace() ) {
				if ( stream.peek() === '\'' ) {
					if ( stream.match( '\'\'', false ) ) {
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
			if ( stream.match( /^[\s\u00a0]*\|[\s\u00a0]*/ ) ) {
				state.tokenize = eatLinkText( state, true );
				return makeLocalStyle( 'mw-link-delimiter', state );
			}
			if ( stream.match( /^[\s\u00a0]*\]\]/ ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			if ( stream.match( /^[\s\u00a0]*[^\s\u00a0|&~#<>[\]{}]+/ ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
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
			var makeFunc = stream.match( /^[\s\u00a0]*[^\]]+\|/, false ) ? makeLocalStyle : makeStyle;
			if ( stream.match( /^[\s\u00a0]*#[\s\u00a0]*/ ) ) {
				state.tokenize = inLinkToSection( makeFunc );
				return makeFunc( 'mw-link', state );
			}
			if ( stream.match( /^[\s\u00a0]*\|[\s\u00a0]*/ ) ) {
				state.tokenize = eatLinkText( state );
				return makeLocalStyle( 'mw-link-delimiter', state );
			}
			if ( stream.match( /^[\s\u00a0]*\]\]/ ) ) {
				state.tokenize = state.stack.pop();
				return makeLocalStyle( 'mw-link-bracket', state, 'nLink' );
			}
			if ( stream.match( /^[\s\u00a0]*[^\s\u00a0|&~#<>[\]{}]+/ ) || stream.eatSpace() ) { // FIXME '{{' brokes Link, sample [[z{{page]]
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
				if ( stream.eat( '\'' ) ) {
					return eatApos( 'mw-link-text' )( stream, state );
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
					state.tokenize = eatChar( '>', 'mw-exttag-bracket' );
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
						state.extMode = CodeMirror.getMode( config, mwConfig.tagModes[ name ] );
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
					pattern = new RegExp( '</' + name + '\\s*>', 'i' ),
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
				if ( stream.match( /^[\s\u00a0]*[|!]/, false ) ) {
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
					if ( stream.match( /^[\s\u00a0]*[|!]/, false ) ) {
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

		function eatFreeExternalLinkProtocol( stream, state ) {
			stream.match( urlProtocols );
			state.tokenize = eatFreeExternalLink;
			return makeStyle( 'mw-free-extlink-protocol', state );
		}

		function eatFreeExternalLink( stream, state ) {
			if ( stream.eol() ) {
				// @todo error message
			} else if ( stream.match( /^[^\s\u00a0{[\]<>~).,']*/ ) ) {
				if ( stream.peek() === '~' ) {
					if ( !stream.match( /^~{3,}/, false ) ) {
						stream.match( /^~*/ );
						return makeStyle( 'mw-free-extlink', state );
					}
				} else if ( stream.peek() === '{' ) {
					if ( !stream.match( /^\{\{/, false ) ) {
						stream.next();
						return makeStyle( 'mw-free-extlink', state );
					}
				} else if ( stream.peek() === '\'' ) {
					if ( !stream.match( '\'\'', false ) ) {
						stream.next();
						return makeStyle( 'mw-free-extlink', state );
					}
				} else if ( stream.match( /^[).,]+(?=[^\s\u00a0{[\]<>~).,])/ ) ) {
					return makeStyle( 'mw-free-extlink', state );
				}
			}
			state.tokenize = state.stack.pop();
			return makeStyle( 'mw-free-extlink', state );
		}

		function eatWikiText( style ) {
			return function ( stream, state ) {
				var ch, tmp, mt, name, isCloseTag, tagname;

				if ( stream.sol() ) {
					clearApos( state );
					if ( !stream.match( '//', false ) && stream.match( urlProtocols ) ) { // highlight free external links, bug T108448
						state.stack.push( state.tokenize );
						state.tokenize = eatFreeExternalLink;
						return makeLocalStyle( 'mw-free-extlink-protocol', state );
					}
					ch = stream.next();
					switch ( ch ) {
						case '-':
							if ( stream.match( /^----*/ ) ) {
								return 'mw-hr';
							}
							break;
						case '=':
							tmp = stream.match( /^(={0,5})(.+?(=\1\s*))$/ );
							if ( tmp ) { // Title
								stream.backUp( tmp[ 2 ].length );
								state.stack.push( state.tokenize );
								state.tokenize = eatSectionHeader( tmp[ 3 ].length );
								return 'mw-section-header line-cm-mw-section-' + ( tmp[ 1 ].length + 1 );
							}
							break;
						case '*':
						case '#':
							mt = stream.match( /^[*#;:]*/ );
							if ( /;/.test( mt[ 0 ] ) ) {
								state.apos.bold = true;
							}
							return 'mw-list';
						case ';':
							state.apos.bold = true;
							stream.match( /^[*#;:]*/ );
							return 'mw-list';
						case ':':
							if ( stream.match( /^:*{\|/, false ) ) { // Highlight indented tables :{|, bug T108454
								state.stack.push( state.tokenize );
								state.tokenize = eatStartTable;
							}
							mt = stream.match( /^[*#;:]*/ );
							if ( /;/.test( mt[ 0 ] ) ) {
								state.apos.bold = true;
							}
							return 'mw-list';
						case ' ':
							if ( stream.match( /^[\s\u00a0]*:*{\|/, false ) ) { // Leading spaces is the correct syntax for a table, bug T108454
								stream.eatSpace();
								if ( stream.match( /^:+/ ) ) { // ::{|
									state.stack.push( state.tokenize );
									state.tokenize = eatStartTable;
									return 'mw-indenting';
								}
								stream.eat( '{' );
							} else {
								return 'mw-skipformatting';
							}
							// break is not necessary here, falls through
						case '{':
							if ( stream.eat( '|' ) ) {
								stream.eatSpace();
								state.stack.push( state.tokenize );
								state.tokenize = inTableDefinition;
								return 'mw-table-bracket';
							}
					}
				} else {
					ch = stream.next();
				}

				switch ( ch ) {
					case '&':
						return makeStyle( eatMnemonic( stream, style ), state );
					case '\'':
						return eatApos( style )( stream, state );
					case '[':
						if ( stream.eat( '[' ) ) { // Link Example: [[ Foo | Bar ]]
							stream.eatSpace();
							if ( /[^\]|[]/.test( stream.peek() ) ) {
								state.nLink++;
								state.stack.push( state.tokenize );
								var nsIds = mw.config.get( 'wgNamespaceIds' ),
									nsFile = Object.keys( nsIds ).filter( function ( ns ) {
										return nsIds[ ns ] === 6;
									} ).join( '|' ),
									nsFileRegex = new RegExp( '^[\\s\\u00a0]*(' + nsFile + ')[\\s\\u00a0]*:', 'i' );
								state.tokenize = stream.match( nsFileRegex, false ) ? inFileLink : inLink;
								return makeLocalStyle( 'mw-link-bracket', state );
							}
						} else {
							mt = stream.match( urlProtocols, false );
							if ( mt ) {
								state.nLink++;
								state.stack.push( state.tokenize );
								state.tokenize = eatExternalLinkProtocol( mt[ 0 ].length );
								return makeLocalStyle( 'mw-extlink-bracket', state );
							}
						}
						break;
					case '{':
						if ( !stream.match( '{{{{', false ) && stream.match( '{{' ) ) { // Template parameter (skip parameters inside a template transclusion, Bug: T108450)
							stream.eatSpace();
							state.stack.push( state.tokenize );
							state.tokenize = inVariable;
							return makeLocalStyle( 'mw-templatevariable-bracket', state );
						} else if ( stream.match( /^\{[\s\u00a0]*/ ) ) {
							if ( stream.peek() === '#' ) { // Parser function
								state.nExt++;
								state.stack.push( state.tokenize );
								state.tokenize = inParserFunctionName;
								return makeLocalStyle( 'mw-parserfunction-bracket', state );
							}
							// Check for parser function without '#'
							name = stream.match( /^([^\s\u00a0}[\]<{'|&:]+)(:|[\s\u00a0]*)(\}\}?)?(.)?/, false );
							if ( name ) {
								if ( ( name[ 2 ] === ':' || name[ 4 ] === undefined || name[ 3 ] === '}}' ) && ( name[ 1 ].toLowerCase() in mwConfig.functionSynonyms[ 0 ] || name[ 1 ] in mwConfig.functionSynonyms[ 1 ] ) ) {
									state.nExt++;
									state.stack.push( state.tokenize );
									state.tokenize = inParserFunctionName;
									return makeLocalStyle( 'mw-parserfunction-bracket', state );
								}
							}
							// Template
							state.nTemplate++;
							state.stack.push( state.tokenize );
							state.tokenize = eatTemplatePageName( false );
							return makeLocalStyle( 'mw-template-bracket', state );
						}
						break;
					case '<':
						isCloseTag = Boolean( stream.eat( '/' ) );
						tagname = stream.match( /^[^>/\s\u00a0.*,[\]{}$^+?|/\\'`~<=!@#%&()-]+/, false );
						if ( stream.match( '!--' ) ) { // comment
							state.stack.push( state.tokenize );
							state.tokenize = eatBlock( 'mw-comment', '-->' );
							return 'mw-comment';
						}
						if ( tagname ) {
							tagname = tagname[ 0 ].toLowerCase();
							if ( tagname in mwConfig.tags ) { // Parser function
								if ( isCloseTag === true ) {
									// @todo message
									return 'error';
								}
								state.stack.push( state.tokenize );
								state.tokenize = eatTagName( tagname.length, isCloseTag, false );
								return makeLocalStyle( 'mw-exttag-bracket', state );
							}
							if ( tagname in permittedHtmlTags ) { // Html tag
								if ( isCloseTag === true && tagname !== state.InHtmlTag.pop() ) {
									// @todo message
									return 'error';
								}
								if ( isCloseTag === true && tagname in voidHtmlTags ) {
									// @todo message
									return 'error';
								}
								state.stack.push( state.tokenize );
								// || ( tagname in voidHtmlTags ) because opening void tags should also be treated as the closing tag.
								state.tokenize = eatTagName( tagname.length, isCloseTag || tagname in voidHtmlTags, true );
								return makeLocalStyle( 'mw-htmltag-bracket', state );
							}
						}
						break;
					case '~':
						if ( stream.match( /^~{2,4}/ ) ) {
							return 'mw-signature';
						}
						break;
					case '_': // Maybe double undescored Magic Word as __TOC__
						tmp = 1;
						while ( stream.eat( '_' ) ) { // Optimize processing of many underscore symbols
							tmp++;
						}
						if ( tmp > 2 ) { // Many underscore symbols
							if ( !stream.eol() ) {
								stream.backUp( 2 ); // Leave last two underscore symbols for processing again in next iteration
							}
							return makeStyle( style, state ); // Optimization: skip regex function at the end for EOL and backuped symbols
						} else if ( tmp === 2 ) { // Check on double underscore Magic Word
							name = stream.match( /^([^\s\u00a0>}[\]<{'|&:~]+?)__/ ); // The same as the end of function except '_' inside and with '__' at the end of string
							if ( name && name[ 0 ] ) {
								if ( '__' + name[ 0 ].toLowerCase() in mwConfig.doubleUnderscore[ 0 ] || '__' + name[ 0 ] in mwConfig.doubleUnderscore[ 1 ] ) {
									return 'mw-doubleUnderscore';
								}
								if ( !stream.eol() ) {
									stream.backUp( 2 ); // Two underscore symbols at the end can be begining of other double undescored Magic Word
								}
								return makeStyle( style, state ); // Optimization: skip regex function at the end for EOL and backuped symbols
							}
						}
						break;
					default:
						stream.backUp( 1 ); // highlight free external links, bug T108448
						if ( stream.match( urlProtocols, false ) && !stream.match( '//' ) ) { // highlight free external links, bug T108448
							state.stack.push( state.tokenize );
							return eatFreeExternalLinkProtocol( stream, state );
						}
						stream.next();
				}
				if ( /[\w\x80-\x9f\u00a1-\uffff]/.test( ch ) ) { // \w and non-ascii unicode except \xa0
					stream.match( /^[A-Za-z0-9\x80-\x9f\u00a1-\uffff]+/ ); // except '_'
				} else { // ascii except /[\w>}[\]<{'|&:~]/ and \xa0
					stream.match( /^[^\w>}[\]<{'|&:~\x80-\x9f\u00a1-\uffff]+/ );
				}
				return makeStyle( style, state );
			};
		}

		return {
			startState: function () {
				return {
					tokenize: eatWikiText( '' ),
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
				var ret;
				if ( state.extName ) {
					if ( state.extMode ) {
						ret = '';
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

	function eatPre( stream, state ) {
		if ( stream.match( /^[^&<]+/ ) ) {
			return '';
		}
		if ( stream.eat( '<' ) ) {
			if ( !state.nowiki && stream.match( 'nowiki>' ) || state.nowiki && stream.match( '/nowiki>' ) ) {
				state.nowiki = !state.nowiki;
				return 'mw-comment';
			}
			return '';
		}
		stream.next(); // eat &
		return eatMnemonic( stream, '' );
	}

	function eatNowiki( stream ) {
		if ( stream.match( /^[^&]+/ ) ) {
			return '';
		}
		stream.next(); // eat &
		return eatMnemonic( stream, '' );
	}

	CodeMirror.defineMode( 'mw-tag-pre', function ( /* config, parserConfig */ ) {
		return {
			startState: function () {
				return {};
			},
			token: eatPre
		};
	} );

	CodeMirror.defineMode( 'mw-tag-nowiki', function ( /* config, parserConfig */ ) {
		return {
			startState: function () {
				return {};
			},
			token: eatNowiki
		};
	} );
}( CodeMirror ) );
