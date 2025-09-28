import type {Diagnostic} from '@codemirror/lint';
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
			};
		};
	};
}

let high: Promise<Set<string>> | undefined;

const getMsgKey = (type: string): string => `linter-category-${type}`;

export default async (): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api(),
		rest = new mw.Rest();
	high ??= (async () => {
		const r = await api.get({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'general',
		}) as ApiResponse;
		return new Set(r.query.general.linter.high);
	})();
	const linter: LintSource = async ({doc}): Promise<Diagnostic[]> => {
		rest.abort();
		const errors = await rest.post('/v1/transform/wikitext/to/lint', {
				wikitext: doc.toString(),
			}) as ParsoidError[],
			error = await high!;
		await api.loadMessagesIfMissing(errors.map(({type}) => getMsgKey(type)));
		return errors.map(({type, dsr: [from, to]}): Diagnostic => ({
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
