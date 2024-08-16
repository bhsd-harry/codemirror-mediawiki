import {CDN, loadScript} from './util';
import type {LinterBase} from 'wikiparser-node/extensions/typings';
import type {Linter} from 'eslint';
import type {Warning} from 'stylelint';
import type {Diagnostic} from '@codemirror/lint';

declare type getLinter<T> = (opt?: Record<string, unknown>) => T;
declare type getAsyncLinter<T> = (opt?: Record<string, unknown>) => Promise<T>;

/**
 * 获取 WikiLint
 * @param opt 选项
 */
export const getWikiLinter: getAsyncLinter<LinterBase> = async opt => {
	const REPO = 'npm/wikiparser-node@browser',
		DIR = `${REPO}/extensions/dist`,
		lang = opt?.['i18n'];
	await loadScript(`${DIR}/base.min.js`, 'wikiparse');
	await loadScript(`${DIR}/lint.min.js`, 'wikiparse.Linter');
	if (typeof lang === 'string') {
		try {
			const i18n: Record<string, string> =
				await (await fetch(`${CDN}/${REPO}/i18n/${lang.toLowerCase()}.json`)).json();
			wikiparse.setI18N(i18n);
		} catch {}
	}
	return new wikiparse.Linter!(opt?.['include'] as boolean | undefined);
};

/**
 * 获取 ESLint
 * @param opt 选项
 */
export const getJsLinter: getAsyncLinter<(text: string) => Linter.LintMessage[]> = async opt => {
	await loadScript('npm/eslint-linter-browserify@8.57.0/linter.min.js', 'eslint', true);
	/** @see https://www.npmjs.com/package/@codemirror/lang-javascript */
	const esLinter = new eslint.Linter(),
		conf: Linter.Config = {
			env: {browser: true, es2024: true},
			parserOptions: {ecmaVersion: 15, sourceType: 'module'},
			rules: {},
			...opt,
		};
	for (const [name, {meta}] of esLinter.getRules()) {
		if (meta?.docs?.recommended) {
			conf.rules![name] ??= 2;
		}
	}
	return text => esLinter.verify(text, conf);
};

/**
 * 获取 Stylelint
 * @param opt 选项
 */
export const getCssLinter: getAsyncLinter<(text: string) => Promise<Warning[]>> = async opt => {
	await loadScript('gh/openstyles/stylelint-bundle/dist/stylelint-bundle.min.js', 'stylelint');
	/** @see https://www.npmjs.com/package/stylelint-config-recommended */
	const config = {
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
					ignore: ['consecutive-duplicates-with-different-syntaxes'],
				},
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
					ignore: ['custom-elements'],
				},
			],
			'string-no-newline': true,
			'unit-no-unknown': true,
			...opt?.['rules'] as Record<string, unknown>,
		},
	};
	return async code => (await stylelint.lint({code, config})).results.flatMap(({warnings}) => warnings);
};

/** 获取 luaparse */
export const getLuaLinter: getAsyncLinter<(text: string) => Diagnostic[]> = async () => {
	await loadScript('npm/luaparse/luaparse.min.js', 'luaparse', true);
	/** @see https://github.com/ajaxorg/ace/pull/4954 */
	luaparse.defaultOptions.luaVersion = '5.3';
	return doc => {
		try {
			luaparse.parse(doc.toString());
		} catch (e) {
			if (e instanceof luaparse.SyntaxError) {
				return [
					{
						source: 'luaparse',
						message: e.message.replace(/^\[\d+:\d+\]\s*/u, ''),
						severity: 'error',
						from: e.index,
						to: e.index,
					},
				];
			}
		}
		return [];
	};
};

declare interface JsonError {
	message: string;
	severity: 'error';
	line: string | undefined;
	column: string | undefined;
	position: string | undefined;
}

/** JSON.parse */
export const getJsonLinter: getLinter<(text: string) => JsonError[]> = () => str => {
	try {
		if (str.trim()) {
			JSON.parse(str);
		}
	} catch (e) {
		if (e instanceof SyntaxError) {
			const {message} = e,
				line = /\bline (\d+)/u.exec(message)?.[1],
				column = /\bcolumn (\d+)/u.exec(message)?.[1],
				position = /\bposition (\d+)/u.exec(message)?.[1];
			return [
				{
					message,
					severity: 'error',
					line,
					column,
					position,
				},
			];
		}
	}
	return [];
};
