import { CodeMirror6 } from './dist/main.min.js';

/** @typedef {import('@codemirror/lint').Diagnostic} Diagnostic */
/** @typedef {(s: string) => Diagnostic[] | Promise<Diagnostic[]>} LintSource */

( () => {
	const /** @type {HTMLTextAreaElement} */ textarea = document.querySelector( '#wpTextbox' ),
		/** @type {NodeListOf<HTMLInputElement>} */ languages = document.querySelectorAll( 'input[name="language"]' ),
		/** @type {NodeListOf<HTMLInputElement>} */ extensions = document.querySelectorAll( 'input[type="checkbox"]' ),
		/** @type {HTMLInputElement} */ indent = document.querySelector( '#indent' ),
		/** @type {import('./src/codemirror').CodeMirror6} */ cm = new CodeMirror6( textarea ),
		/** @type {Record<string, LintSource} */ linters = {};
	let config;

	/**
	 * 使用传统方法加载脚本
	 * @param {string} lang
	 * @param {string} src
	 * @param {() => LintSource} callback
	 */
	const loadScript = ( lang, src, callback ) => {
		const script = document.createElement( 'script' );
		script.src = `https://testingcf.jsdelivr.net/${ src }`;
		script.onload = () => {
			const lintSource = callback();
			linters[ lang ] = lintSource;
			cm.lint( lintSource );
		};
		document.head.append( script );
	};

	/**
	 * 设置语言
	 * @param {string} lang
	 */
	const init = async ( lang ) => {
		if ( lang === 'mediawiki' ) {
			// eslint-disable-next-line require-atomic-updates
			config = config || await ( await fetch( 'config.json' ) ).json();
		}
		cm.setLanguage( lang, config );
		if ( !( lang in linters ) ) {
			switch ( lang ) {
				case 'mediawiki': {
					const src = 'combine/npm/wikiparser-node@1.1.3-b/extensions/dist/base.min.js,'
						+ 'npm/wikiparser-node@1.1.3-b/extensions/dist/lint.min.js';
					const callback = () => {
						const /** @type {{codemirror: LintSource}} */ Linter = new window.wikiparse.Linter();
						return /** @type {LintSource} */ ( s ) => Linter.codemirror( s );
					};
					loadScript( lang, src, callback );
					break;
				}
				case 'javascript': {
					const src = 'npm/eslint-linter-browserify';
					/** @see https://npmjs.com/package/@codemirror/lang-javascript */
					const callback = () => {
						const /** @type {import('eslint').Linter} */ linter = new window.eslint.Linter(),
							conf = {
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
						for ( const [ name, { meta } ] of linter.getRules() ) {
							if ( meta && meta.docs && meta.docs.recommended ) {
								conf.rules[ name ] = 2;
							}
						}
						return /** @type {LintSource} */ ( s ) => linter.verify( s, conf )
							.map( ( { message, severity, line, column, endLine, endColumn } ) => {
								const from = cm.view.state.doc.line( line ).from + column - 1;
								return {
									message,
									severity: severity === 1 ? 'warning' : 'error',
									from,
									to: endLine === undefined
										? from + 1
										: cm.view.state.doc.line( endLine ).from + endColumn - 1
								};
							} );
					};
					loadScript( lang, src, callback );
					break;
				}
				case 'css': {
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
					const src = 'gh/openstyles/stylelint-bundle/dist/stylelint-bundle.min.js';
					const /** @type {LintSource} */ lintSource = async ( s ) => {
						/** @type {{results: import('stylelint').LintResult[]}} */
						const { results } = await window.stylelint.lint( { code: s, config: conf } ),
							/** @type {import('stylelint').Warning[]} */
							messages = results.reduce( ( acc, { warnings } ) => [ ...acc, ...warnings ], [] );
						return messages.map( ( { text, severity, line, column, endLine, endColumn } ) => ( {
							message: text,
							severity,
							from: cm.view.state.doc.line( line ).from + column - 1,
							to: endLine === undefined
								? cm.view.state.doc.line( line ).to
								: cm.view.state.doc.line( endLine ).from + endColumn - 1
						} ) );
					};
					loadScript( lang, src, () => lintSource );
					break;
				}
				case 'lua': {
					const src = 'npm/luaparse';
					/** @see https://github.com/ajaxorg/ace/blob/master/lib/ace/mode/lua_worker.js */
					const /** @type {LintSource} */ lintSource = ( s ) => {
						/** @type {{parse(s: string): void, SyntaxError: new () => {message: string, index: number}}} */
						const luaparse = window.luaparse; // eslint-disable-line prefer-destructuring
						try {
							luaparse.parse( s );
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
					loadScript( lang, src, () => lintSource );
				}
				// no default
			}
		}
	};

	/** 设置扩展 */
	const prefer = () => {
		const preferred = [ ...extensions ].filter( ( { checked } ) => checked ).map( ( { id } ) => id );
		cm.prefer( preferred );
	};

	/** 设置缩进 */
	const indentChange = () => {
		cm.setIndent( indent.value || '\t' );
	};

	for ( const input of languages ) {
		input.addEventListener( 'change', () => {
			init( input.id );
		} );
		if ( input.checked ) {
			init( input.id );
		}
	}
	for ( const extension of extensions ) {
		extension.addEventListener( 'change', prefer );
	}
	prefer();
	indent.addEventListener( 'change', indentChange );
	indentChange();

	Object.assign( window, { cm } );
} )();
