import {getOpt} from '../src/lintsource';
import {buildWidgets, panelLinter} from './preference';
import type {Diagnostic} from '@codemirror/lint';
import type {Option, LiveOption} from '../src/linter';
import type {LintSource} from '../src/lintsource';

declare interface ParsoidError {
	type: string;
	dsr: [number, number];
}
declare interface ApiResponse {
	query: {
		general: {
			linter: {
				high: string[];
				medium: string[];
				low: string[];
			};
		};
	};
}

let highSet: Promise<Set<string>> | undefined;

const getMsgKey = (type: string): string => `linter-category-${type}`,
	getRuleKey = (type: string): string => `parsoid-${type}`;

export const parsoidRules: string[] = [];

export default async (opt?: Option | LiveOption): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api(),
		rest = new mw.Rest();
	highSet ??= (async () => {
		const {query: {general: {linter: {high, medium, low}}}} = await api.get({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'general',
		}) as ApiResponse;
		parsoidRules.push(...[...high, ...medium, ...low].map(getRuleKey));
		if (panelLinter.$element) {
			panelLinter.$element.append(...buildWidgets(parsoidRules));
		}
		return new Set(high);
	})();
	let timeout: Promise<ParsoidError[]> | undefined,
		waiting: string | undefined;
	const execute = async (wikitext: string): Promise<ParsoidError[]> => {
		rest.abort();
		if (timeout) {
			waiting = wikitext;
			return timeout;
		}
		timeout = new Promise<ParsoidError[]>(resolve => {
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
		// eslint-disable-next-line promise/prefer-await-to-then
		return rest.post('/v1/transform/wikitext/to/lint', {wikitext}).then(
			errors => errors as ParsoidError[],
			(_, e) => {
				if (e.textStatus !== 'abort') {
					console.error('Parsoid linting failed:', e);
				}
				return [];
			},
		);
	};
	const linter: LintSource = async ({doc}): Promise<Diagnostic[]> => {
		const errors = await execute(doc.toString()),
			config = await getOpt(opt, true),
			defaultSeverity = config?.['defaultSeverity'] as string | number | undefined ?? 2,
			error = await highSet!;
		await api.loadMessagesIfMissing(errors.map(({type}) => getMsgKey(type)));
		return errors.filter(
			({type}) => Number(config?.[getRuleKey(type)] ?? defaultSeverity) > 1 - Number(error.has(type)),
		).map(({type, dsr: [from, to]}): Diagnostic => ({
			severity: error.has(type) ? 'error' : 'warning',
			source: 'Parsoid',
			message: mw.msg(getMsgKey(type)),
			from,
			to,
		}));
	};
	return linter;
};
