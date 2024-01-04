import { Compartment } from '@codemirror/state';
import {
	EditorView,
	lineNumbers,
	keymap,
	highlightSpecialChars,
	highlightActiveLine,
	highlightWhitespace,
	highlightTrailingWhitespace
} from '@codemirror/view';
import {
	syntaxHighlighting,
	defaultHighlightStyle,
	indentOnInput,
	StreamLanguage,
	LanguageSupport,
	bracketMatching,
	indentUnit
} from '@codemirror/language';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { linter, lintGutter, openLintPanel, closeLintPanel } from '@codemirror/lint';
import { closeBrackets } from '@codemirror/autocomplete';
import { mediawiki, html } from './mediawiki';
import * as plugins from './plugins';
import type { ViewPlugin } from '@codemirror/view';
import type { Extension, Text } from '@codemirror/state';
import type { Diagnostic } from '@codemirror/lint';
import type { Highlighter } from '@lezer/highlight';
import type { Linter } from 'eslint';

export type { MwConfig } from './mediawiki';
export type LintSource = ( doc: Text ) => Diagnostic[] | Promise<Diagnostic[]>;

const languages: Record<string, ( config?: any ) => LanguageSupport | []> = {
	plain: () => [],
	mediawiki,
	html
};
for ( const [ language, parser ] of Object.entries( plugins ) ) {
	languages[ language ] = (): LanguageSupport => new LanguageSupport( StreamLanguage.define( parser ) );
}
const linters: Record<string, Extension> = {};
const avail: Record<string, [ ( config?: any ) => Extension, Record<string, unknown> ]> = {
	highlightSpecialChars: [ highlightSpecialChars, {} ],
	highlightActiveLine: [ highlightActiveLine, {} ],
	highlightWhitespace: [ highlightWhitespace, {} ],
	highlightTrailingWhitespace: [ highlightTrailingWhitespace, {} ],
	bracketMatching: [ bracketMatching, { mediawiki: { brackets: '[]{}' } } ],
	closeBrackets: [ closeBrackets, {} ]
};

/** 使用传统方法加载脚本 */
const loadScript = ( src: string, target: string ): Promise<void> => new Promise( ( resolve ) => {
	if ( target in window ) {
		resolve();
		return;
	}
	const script = document.createElement( 'script' );
	script.src = `https://testingcf.jsdelivr.net/${ src }`;
	script.onload = (): void => {
		resolve();
	};
	document.head.append( script );
} );

export class CodeMirror6 {
	readonly #textarea;
	readonly #language;
	readonly #linter;
	readonly #extensions;
	readonly #indent;
	readonly #view;
	lang;

	get textarea(): HTMLTextAreaElement {
		return this.#textarea;
	}

	get view(): EditorView {
		return this.#view;
	}

	/**
	 * @param textarea 文本框
	 * @param lang 语言
	 * @param config 语言设置
	 */
	constructor( textarea: HTMLTextAreaElement, lang = 'plain', config?: unknown ) {
		this.#textarea = textarea;
		this.lang = lang;
		this.#language = new Compartment();
		this.#linter = new Compartment();
		this.#extensions = new Compartment();
		this.#indent = new Compartment();
		let timer: number | undefined;
		const extensions = [
			this.#language.of( languages[ lang ]!( config ) ),
			this.#linter.of( [] ),
			this.#extensions.of( [] ),
			this.#indent.of( indentUnit.of( '\t' ) ),
			syntaxHighlighting( defaultHighlightStyle as Highlighter ),
			EditorView.contentAttributes.of( {
				accesskey: textarea.accessKey,
				dir: textarea.dir,
				lang: textarea.lang
			} ),
			lineNumbers(),
			EditorView.lineWrapping,
			history(),
			indentOnInput(),
			keymap.of( [
				...defaultKeymap,
				...historyKeymap,
				...searchKeymap
			] ),
			EditorView.updateListener.of( ( { state: { doc }, docChanged } ) => {
				if ( docChanged ) {
					clearTimeout( timer );
					timer = window.setTimeout( () => {
						textarea.value = doc.toString();
					}, 400 );
				}
			} )
		];
		this.#view = new EditorView( {
			extensions,
			doc: textarea.value
		} );
		const { offsetHeight, selectionStart, selectionEnd, scrollTop } = textarea,
			{ fontSize, lineHeight } = getComputedStyle( textarea ),
			hasFocus = document.activeElement === textarea;
		textarea.parentNode!.insertBefore( this.#view.dom, textarea );
		this.#view.dom.style.minHeight = '2em';
		this.#view.dom.style.height = `${ offsetHeight }px`;
		this.#view.dom.style.fontSize = fontSize;
		this.#view.scrollDOM.style.lineHeight = lineHeight;
		this.#view.requestMeasure();
		this.#view.dispatch( {
			selection: { anchor: selectionStart, head: selectionEnd }
		} );
		textarea.style.display = 'none';
		if ( hasFocus ) {
			this.#view.focus();
		}
		window.requestAnimationFrame( () => {
			this.#view.scrollDOM.scrollTop = scrollTop;
		} );
	}

	/**
	 * 设置语言
	 * @param lang 语言
	 * @param config 语言设置
	 */
	setLanguage( lang = 'plain', config?: unknown ): void {
		this.#view.dispatch( {
			effects: [
				this.#language.reconfigure( languages[ lang ]!( config ) ),
				this.#linter.reconfigure( linters[ lang ] ?? [] )
			]
		} );
		this.lang = lang;
		( linters[ lang ] ? openLintPanel : closeLintPanel )( this.#view );
	}

	/**
	 * 开始语法检查
	 * @param lintSource 语法检查函数
	 */
	lint( lintSource?: LintSource ): void {
		const { lang } = this,
			linterExtension = lintSource
				? [
					linter( ( view ) => lintSource( view.state.doc ) ),
					lintGutter()
				]
				: [];
		if ( lintSource ) {
			linters[ lang ] = linterExtension;
		} else {
			delete linters[ lang ];
		}
		this.#view.dispatch( {
			effects: [ this.#linter.reconfigure( linterExtension ) ]
		} );
		( lintSource ? openLintPanel : closeLintPanel )( this.#view );
	}

	/** 立即更新语法检查 */
	update(): void {
		const extension = this.#linter.get( this.#view.state ) as [[ unknown, ViewPlugin<{
			set: boolean;
			force(): void;
		}> ]] | [];
		if ( extension.length > 0 ) {
			const plugin = this.#view.plugin( extension[ 0 ]![ 1 ] )!;
			plugin.set = true;
			plugin.force();
		}
	}

	/** 添加扩展 */
	prefer( names: readonly string[] ): void {
		const { lang } = this;
		this.#view.dispatch( {
			effects: [
				this.#extensions.reconfigure( names.map( ( name ) => {
					const [ extension, configs ] = avail[ name ]!;
					return extension( configs[ lang ] );
				} ) )
			]
		} );
	}

	/** 设置缩进 */
	setIndent( indent: string ): void {
		this.#view.dispatch( {
			effects: [ this.#indent.reconfigure( indentUnit.of( indent ) ) ]
		} );
	}

	/** 获取默认linter */
	async getLinter(): Promise<LintSource> {
		switch ( this.lang ) {
			case 'mediawiki': {
				const src = 'combine/npm/wikiparser-node@1.2.0-b/extensions/dist/base.min.js,'
					+ 'npm/wikiparser-node@1.2.0-b/extensions/dist/lint.min.js';
				await loadScript( src, 'wikiparse' );
				const wikiLinter = new wikiparse.Linter();
				return ( doc ) => wikiLinter.codemirror( doc.toString() );
			}
			case 'javascript': {
				await loadScript( 'npm/eslint-linter-browserify', 'eslint' );
				/** @see https://npmjs.com/package/@codemirror/lang-javascript */
				const esLinter = new eslint.Linter(),
					conf: Linter.Config = {
						env: {
							browser: true,
							es2018: true
						},
						parserOptions: {
							ecmaVersion: 9,
							sourceType: 'module'
						},
						rules: {}
					};
				for ( const [ name, { meta } ] of esLinter.getRules() ) {
					if ( meta?.docs!.recommended ) {
						conf.rules![ name ] = 2;
					}
				}
				return ( doc ) => esLinter.verify( doc.toString(), conf )
					.map( ( { message, severity, line, column, endLine, endColumn } ) => {
						const from = doc.line( line ).from + column - 1;
						return {
							message,
							severity: severity === 1 ? 'warning' : 'error',
							from,
							to: endLine === undefined ? from + 1 : doc.line( endLine ).from + endColumn! - 1
						};
					} );
			}
			case 'css': {
				await loadScript( 'gh/openstyles/stylelint-bundle/dist/stylelint-bundle.min.js', 'stylelint' );
				/** @see https://npmjs.com/package/stylelint-config-recommended */
				const conf = {
					rules: {
						'annotation-no-unknown': true,
						'at-rule-no-unknown': true,
						'block-no-empty': true,
						'color-no-invalid-hex': true,
						'comment-no-empty': true,
						'custom-property-no-missing-var-function': true,
						'declaration-block-no-duplicate-custom-properties': true,
						'declaration-block-no-duplicate-properties': [
							true,
							{
								ignore: [ 'consecutive-duplicates-with-different-syntaxes' ]
							}
						],
						'declaration-block-no-shorthand-property-overrides': true,
						'font-family-no-duplicate-names': true,
						'font-family-no-missing-generic-family-keyword': true,
						'function-calc-no-unspaced-operator': true,
						'function-linear-gradient-no-nonstandard-direction': true,
						'function-no-unknown': true,
						'keyframe-block-no-duplicate-selectors': true,
						'keyframe-declaration-no-important': true,
						'media-feature-name-no-unknown': true,
						'media-query-no-invalid': true,
						'named-grid-areas-no-invalid': true,
						'no-descending-specificity': true,
						'no-duplicate-at-import-rules': true,
						'no-duplicate-selectors': true,
						'no-empty-source': true,
						'no-invalid-double-slash-comments': true,
						'no-invalid-position-at-import-rule': true,
						'no-irregular-whitespace': true,
						'property-no-unknown': true,
						'selector-anb-no-unmatchable': true,
						'selector-pseudo-class-no-unknown': true,
						'selector-pseudo-element-no-unknown': true,
						'selector-type-no-unknown': [
							true,
							{
								ignore: [ 'custom-elements' ]
							}
						],
						'string-no-newline': true,
						'unit-no-unknown': true
					}
				};
				return async ( doc ) => {
					const { results } = await stylelint.lint( { code: doc.toString(), config: conf } );
					return results.flatMap( ( { warnings } ) => warnings )
						.map( ( { text, severity, line, column, endLine, endColumn } ) => ( {
							message: text,
							severity,
							from: doc.line( line ).from + column - 1,
							to: endLine === undefined ? doc.line( line ).to : doc.line( endLine ).from + endColumn! - 1
						} ) );
				};
			}
			case 'lua':
				await loadScript( 'npm/luaparse', 'luaparse' );
				/** @see https://github.com/ajaxorg/ace/blob/master/lib/ace/mode/lua_worker.js */
				return ( doc ) => {
					try {
						luaparse.parse( doc.toString() );
					} catch ( e ) {
						if ( e instanceof luaparse.SyntaxError ) {
							return [
								{
									message: e.message,
									severity: 'error',
									from: e.index,
									to: e.index
								}
							];
						}
					}
					return [];
				};
			default:
				return () => [];
		}
	}
}
