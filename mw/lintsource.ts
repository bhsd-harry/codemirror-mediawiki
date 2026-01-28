import {getLSP} from '@bhsd/browser';
import {getOpt} from '../src/lintsource';
import {base} from '../src/constants';
import {templateData} from './util';
import {buildPanel, preferenceDialog} from './preference';
import type {Text} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {AST} from 'wikiparser-node';
import type {TemplateDataApiTemplateDataParams, ApiQuerySiteinfoParams} from 'types-mediawiki-api';
import type {Option, LiveOption} from '../src/linter';
import type {LintSource} from '../src/lintsource';
import type {CodeMirror} from './codemirror';
import type {TemplateData, Parameter} from './util';

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
	pages?: Record<number, TemplateData>;
	normalized?: {from: string, to: string}[];
	redirects?: {from: string, to: string}[];
}

declare type Executer<T = ApiValidateError> = (text: string) => Promise<T[]>;

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

const getValidator = async (
	contentmodel: 'javascript' | 'sanitized-css' | 'Scribunto',
	title: string,
): Promise<Executer> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api();
	return getExecuter(
		api,
		content => api.post({
			action: 'codemirror-validate',
			contentmodel,
			content,
			title: title || 'Extension:CodeMirror',
			formatversion: 2, // eslint-disable-next-line promise/prefer-await-to-then
		}).then((r: ApiResponse) => r['codemirror-validate']!.errors ?? []) as unknown as ReturnType<mw.Api['get']>,
	);
};

export const getParsoidLintSource = async (title: string, opt?: Option | LiveOption): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api(),
		rest = new mw.Rest();
	highSet ??= (async () => {
		const {general: {linter: {high, medium, low}}} = (await api.get({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'general',
		} satisfies ApiQuerySiteinfoParams) as ApiResponse).query!;
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

const voidLintSource: LintSource = () => [];

export const getTemplateDataLintSource = async ({langConfig, view, getWikiConfig}: CodeMirror): Promise<LintSource> => {
	if (!('templatedata' in langConfig!.tags)) {
		return voidLintSource;
	}
	const lsp = getLSP(view!, false, getWikiConfig, base.CDN);
	if (!lsp || !('findTemplateTokens' in lsp)) {
		return voidLintSource;
	}
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api({
		parameters: {
			action: 'templatedata',
			lang: mw.config.get('wgUserLanguage'),
			redirects: true,
			formatversion: '2',
		} satisfies TemplateDataApiTemplateDataParams,
	});
	let running: Promise<void> | undefined,
		latest: Text | undefined;
	return async ({doc}): Promise<Diagnostic[]> => {
		latest = doc;
		await lsp.provideDefinition(doc.toString(), {line: 0, character: 0});
		const templates = await lsp.findTemplateTokens();
		// 总是等待上一个请求完成，防止冗余请求
		await running;
		// 仅在内容未更改时发送请求
		if (latest === doc) {
			const names = [...new Set(templates.map(({name}) => name!))].filter(name => !templateData.has(name));
			running = (async () => { // eslint-disable-line require-atomic-updates
				for (let i = 0; i < names.length / 50; i++) {
					const batch = names.slice(i * 50, (i + 1) * 50),
						// eslint-disable-next-line no-await-in-loop
						{pages, normalized = [], redirects = []} = await api.post({
							titles: batch.join('|'),
						}) as ApiResponse,
						data = Object.values(pages!);
					for (const name of batch) {
						const page = data.find(
							({title}) => title === name
								|| title === [...normalized, ...redirects].find(({from}) => from === name)?.to,
						);
						templateData.set(name, page);
					}
				}
			})();
			await running;
		}
		const diagnostics: Diagnostic[] = [];
		for (const {name, childNodes, range: [from, to]} of templates) {
			const data = templateData.get(name!)?.params;
			if (!data) {
				continue;
			}
			const params = Object.entries(data),
				actual = new WeakMap<Parameter, AST[]>();
			for (const child of childNodes!.slice(1)) {
				const param = params.find(([p, {aliases}]) => p === child.name || aliases.includes(child.name!));
				if (param) {
					const entry = actual.get(param[1]);
					if (entry) {
						entry.push(child);
					} else {
						actual.set(param[1], [child]);
					}
				}
			}
			const missing: string[] = [];
			for (const [p, param] of params) {
				const nodes = actual.get(param);
				if (nodes) {
					if (param.deprecated || nodes.length > 1) {
						const rule = param.deprecated ? 'Deprecated' : 'Duplicate';
						diagnostics.push(...nodes.map(({range}): Diagnostic => ({
							from: range[0],
							to: range[1],
							severity: 'warning',
							source: 'TemplateData',
							message: `${rule} parameter ${JSON.stringify(p)}`,
						})));
					}
				} else if (param.required) {
					missing.push(p);
				}
			}
			if (missing.length > 0) {
				diagnostics.push({
					from,
					to,
					severity: 'warning',
					source: 'TemplateData',
					message: `Missing required parameter(s): ${
						missing.map(p => JSON.stringify(p)).join(', ')
					}`,
				});
			}
		}
		return diagnostics;
	};
};

export const getTemplateStylesLintSource = async (title: string): Promise<LintSource> => {
	const map = new mw.Map<Record<string, string>>(),
		execute = await getValidator('sanitized-css', title);
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
	const execute = await getValidator('Scribunto', title);
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
	const execute = await getValidator('javascript', title);
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
