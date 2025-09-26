import type {Diagnostic} from '@codemirror/lint';
import type {LintSource} from '../src/lintsource';

declare interface ParsoidError {
	type: string;
	dsr: [number, number];
}

const error = new Set([
	'deletable-table-tag',
	'duplicate-ids',
	'html5-misnesting',
	'misc-tidy-replacement-issues',
	'multiline-html-table-in-list',
	'multiple-unclosed-formatting-tags',
	'pwrap-bug-workaround',
	'self-closed-tag',
	'tidy-font-bug',
	'tidy-whitespace-bug',
	'unclosed-quotes-in-heading',
]);

const getMsgKey = (type: string): string => `linter-category-${type}`;

export default async (): Promise<LintSource> => {
	await mw.loader.using('mediawiki.api');
	const api = new mw.Api();
	return async ({doc}): Promise<Diagnostic[]> => {
		const form = new FormData();
		form.append('wikitext', doc.toString());
		const errors: ParsoidError[] = await (await fetch(
			`${location.origin}/api/rest_v1/transform/wikitext/to/lint`,
			{
				method: 'POST',
				body: form,
			},
		)).json();
		await api.loadMessagesIfMissing(errors.map(({type}) => getMsgKey(type)));
		return errors.map(({type, dsr}): Diagnostic => ({
			severity: error.has(type) ? 'error' : 'warning',
			source: 'Extension:Linter',
			message: mw.msg(getMsgKey(type)),
			from: dsr[0] - 1,
			to: dsr[1] - 1,
		})).filter(({to}) => to <= doc.length);
	};
};
