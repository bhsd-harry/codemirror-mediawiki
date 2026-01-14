import {getOpt} from '../src/lintsource';
import {buildPanel, preferenceDialog} from './preference';
import type {Diagnostic} from '@codemirror/lint';
import type {Option, LiveOption} from '../src/linter';
import type {LintSource} from '../src/lintsource';

declare interface ParsoidError {
	type: string;
	dsr: [number, number];
}
declare interface ApiValidateError {
	message: string;
	line?: number;
	column?: number;
}
declare interface ApiResponse {
	query?: {
		general: {
			linter: {
				high: string[];
				medium: string[];
				low: string[];
			};
		};
	};
	'codemirror-validate'?: {
		valid: boolean;
		errors?: ApiValidateError[];
	};
}

declare type Executer<T> = (text: string) => Promise<T[]>;

let highSet: Promise<Set<string>> | undefined;

const getMsgKey = (type: string): string => `linter-category-${type}`,
	getRuleKey = (type: string): string => `parsoid-${type}`,
	isEqualError = (a: ParsoidError, b: ParsoidError): boolean =>
		a.type === b.type && a.dsr[0] === b.dsr[0] && a.dsr[1] === b.dsr[1];

export const parsoidRules: string[] = [];

const getExecuter = <T = ApiValidateError>(
	api: mw.Api | mw.Rest,
	post: (content: string) => ReturnType<mw.Api['get']>,
): Executer<T> => {
	let timeout: Promise<T[]> | undefined,
		waiting: string | undefined;
	const execute: Executer<T> = async (content: string): Promise<T[]> => {
		api.abort();
		if (timeout) {
			waiting = content;
			return timeout;
		}
		timeout = new Promise<T[]>(resolve => {
			setTimeout(() => {
				timeout = undefined;
				if (waiting === undefined) {
					resolve([]);
				} else {
					const text = waiting;
					waiting = undefined;
					resolve(execute(text));
				}
			}, 3e3);
		});
		return content
			? post(content).then( // eslint-disable-line promise/prefer-await-to-then
				errors => errors as T[],
				(_, e) => {
					if (typeof e !== 'object' || e.textStatus !== 'abort') {
						console.error('API linting failed:', e);
					}
					return [];
				},
			)
			: [];
	};
	return execute;
};

const codemirrorValidate = (
	api: mw.Api,
	content: string,
	title: string,
	contentmodel: 'javascript' | 'sanitized-css' | 'Scribunto',
): ReturnType<mw.Api['get']> => api.post({
	action: 'codemirror-validate',
	contentmodel,
	content,
	title: title || 'Extension:CodeMirror',
	formatversion: 2, // eslint-disable-next-line promise/prefer-await-to-then
}).then((r: ApiResponse) => r['codemirror-validate']!.errors ?? []) as unknown as ReturnType<mw.Api['get']>;

export const getParsoidLintSource = async (title: string, opt?: Option | LiveOption): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api(),
		rest = new mw.Rest();
	highSet ??= (async () => {
		const {general: {linter: {high, medium, low}}} = (await api.get({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'general',
		}) as ApiResponse).query!;
		parsoidRules.push(...[...high, ...medium, ...low].map(getRuleKey));
		if (preferenceDialog.layout) {
			preferenceDialog.layout.addTabPanels(buildPanel('Parsoid', parsoidRules), 2);
		}
		return new Set(high);
	})();
	const execute = getExecuter<ParsoidError>(
		rest,
		wikitext => rest.post(
			`/v1/transform/wikitext/to/lint${title && '/'}${
				encodeURIComponent(title.replace(/\s+/gu, '_'))
			}`,
			{wikitext},
		),
	);
	const linter: LintSource = async ({doc}): Promise<Diagnostic[]> => {
		const errors = await execute(doc.toString()),
			config = await getOpt(opt, true),
			defaultSeverity = config?.['defaultSeverity'] as string | number | undefined ?? 2,
			error = await highSet!;
		await api.loadMessagesIfMissing(errors.map(({type}) => getMsgKey(type)));
		return errors
			.filter(({type}) => Number(config?.[getRuleKey(type)] ?? defaultSeverity) > 1 - Number(error.has(type)))
			.reduce<ParsoidError[]>((acc, cur) => { // eslint-disable-line unicorn/no-array-reduce
				if (!acc.some(err => isEqualError(err, cur))) {
					acc.push(cur);
				}
				return acc;
			}, [])
			.map(({type, dsr: [from, to]}): Diagnostic => ({
				severity: error.has(type) ? 'error' : 'warning',
				source: 'Parsoid',
				message: mw.msg(getMsgKey(type)),
				from,
				to,
			}));
	};
	return linter;
};

export const getTemplateStylesLintSource = async (title: string): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api(),
		map = new mw.Map<Record<string, string>>(),
		execute = getExecuter(
			api,
			content => codemirrorValidate(api, content, title, 'sanitized-css'),
		);
	const linter: LintSource = async ({doc}): Promise<Diagnostic[]> =>
		(await execute(doc.toString())).map(({message, line, column}): Diagnostic => {
			const from = doc.line(line!).from + column! - 1;
			return {
				severity: 'error',
				source: 'TemplateStyles',
				message,
				renderMessage(): HTMLSpanElement {
					map.set('', message);
					const span = document.createElement('span');
					span.innerHTML = new mw.Message(map, '').parse();
					return span;
				},
				from,
				to: from,
			};
		});
	return linter;
};

export const getScribuntoLintSource = async (title: string): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api(),
		execute = getExecuter(
			api,
			content => codemirrorValidate(api, content, title, 'Scribunto'),
		);
	const linter: LintSource = async ({doc}): Promise<Diagnostic[]> =>
		(await execute(doc.toString())).map(({message, line}): Diagnostic => {
			const {from, to} = line === undefined ? {from: 0, to: 0} : doc.line(line);
			return {
				severity: 'error',
				source: 'Scribunto',
				message,
				from,
				to,
			};
		});
	return linter;
};

export const getPeastLintSource = async (title: string): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api(),
		execute = getExecuter(
			api,
			content => codemirrorValidate(api, content, title, 'javascript'),
		);
	const linter: LintSource = async ({doc}): Promise<Diagnostic[]> =>
		(await execute(doc.toString())).map(({message, line, column}): Diagnostic => {
			const from = doc.line(line!).from + column!;
			return {
				severity: 'error',
				source: 'Peast',
				message,
				from,
				to: from,
			};
		});
	return linter;
};
