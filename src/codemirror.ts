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
import { // eslint-disable-line @typescript-eslint/consistent-type-imports
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
import { linter, lintGutter, lintKeymap } from '@codemirror/lint';
import { closeBrackets } from '@codemirror/autocomplete';
import { mediawiki, html } from './mediawiki';
import * as plugins from './plugins';
import type { ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Diagnostic } from '@codemirror/lint';
import type { Highlighter } from '@lezer/highlight';

export type { MwConfig } from './mediawiki';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const languages: Record<string, ( config?: any ) => LanguageSupport | []> = {
	plain: () => [],
	mediawiki,
	html
};
for ( const [ language, parser ] of Object.entries( plugins ) ) {
	languages[ language ] = (): LanguageSupport => new LanguageSupport( StreamLanguage.define( parser ) );
}
const linters: Record<string, Extension> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const avail: Record<string, [ ( config?: any ) => Extension, Record<string, unknown> ]> = {
	highlightSpecialChars: [ highlightSpecialChars, {} ],
	highlightActiveLine: [ highlightActiveLine, {} ],
	highlightWhitespace: [ highlightWhitespace, {} ],
	highlightTrailingWhitespace: [ highlightTrailingWhitespace, {} ],
	bracketMatching: [ bracketMatching, { mediawiki: { brackets: '[]{}' } } ],
	closeBrackets: [ closeBrackets, {} ]
};

export class CodeMirror6 {
	#textarea;
	#language;
	#linter;
	#extensions;
	#indent;
	#view;

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
		const { offsetHeight } = textarea;
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
		textarea.parentNode!.insertBefore( this.#view.dom, textarea );
		this.#view.dom.style.minHeight = '2em';
		this.#view.dom.style.height = `${ offsetHeight }px`;
		this.#view.requestMeasure();
		textarea.style.display = 'none';
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
	}

	/**
	 * 开始语法检查
	 * @param lintSource 语法检查函数
	 */
	lint( lintSource?: ( str: string ) => Diagnostic[] | Promise<Diagnostic[]> ): void {
		const { language } = this.#language.get( this.#view.state ) as LanguageSupport | { language: undefined },
			name = language?.name || 'plain',
			linterExtension = lintSource
				? [
					linter( ( view: EditorView ) => lintSource( view.state.doc.toString() ) ),
					lintGutter(),
					keymap.of( lintKeymap )
				]
				: [];
		if ( lintSource ) {
			linters[ name ] = linterExtension;
		} else {
			delete linters[ name ];
		}
		this.#view.dispatch( {
			effects: [ this.#linter.reconfigure( linterExtension ) ]
		} );
	}

	/** 立即更新语法检查 */
	update(): void {
		const extension = this.#linter.get( this.#view.state ) as [ unknown, ViewPlugin<{
			set: boolean;
			force(): void;
		}> ] | [];
		if ( extension.length > 0 ) {
			const plugin = this.#view.plugin( extension[ 1 ]! )!;
			plugin.set = true;
			plugin.force();
		}
	}

	/** 添加扩展 */
	prefer( names: string[] ): void {
		const { language } = this.#language.get( this.#view.state ) as LanguageSupport | { language: undefined },
			lang = language?.name || 'plain';
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
}
