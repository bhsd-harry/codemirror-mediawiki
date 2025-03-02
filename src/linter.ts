import {CDN, loadScript, styleLint} from '@bhsd/common';
import type {LinterBase} from 'wikiparser-node/extensions/typings';
import type {Linter} from 'eslint';
import type {Warning} from 'stylelint';
import type {Diagnostic} from 'luacheck-browserify';

declare type getLinter<T> = (opt?: Record<string, unknown>) => T;
declare type getAsyncLinter<T> = (opt?: Record<string, unknown>) => Promise<T>;

/**
 * 获取 WikiLint
 * @param opt 选项
 */
export const getWikiLinter: getAsyncLinter<LinterBase> = async opt => {
	const REPO = 'npm/wikiparser-node',
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
	await loadScript('npm/stylelint-bundle', 'stylelint');
	return code => styleLint(stylelint, code, opt?.['rules'] as Record<string, unknown> | undefined);
};

/** 获取 Luacheck */
export const getLuaLinter: getAsyncLinter<(text: string) => Promise<Diagnostic[]>> = async () => {
	await loadScript('npm/luacheck-browserify/dist/index.min.js', 'luacheck');
	const luachecker = await luacheck(undefined as unknown as string);
	return async text => (await luachecker.queue(text)).filter(({severity}) => severity);
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
