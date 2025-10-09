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
	const linter: LintSource = async ({doc}): Promise<Diagnostic[]> => {
		rest.abort();
		const errors = await rest.post('/v1/transform/wikitext/to/lint', {
				wikitext: doc.toString(),
			}) as ParsoidError[],
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
	linter.delay = 3e3;
	return linter;
};
