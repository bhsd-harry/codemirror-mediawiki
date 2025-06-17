import type {ApiOpenSearchParams, TemplateDataApiTemplateDataParams} from 'types-mediawiki/api_params';
import type {ApiSuggest, ApiSuggestions} from '../src/token';

declare interface TemplateParam {
	label: string | null;
	aliases: string[];
}

const templateParameters = new Map<string, ApiSuggestions>();

/**
 * 获取维基链接建议
 * @param api mw.Api 实例
 * @param title 页面标题
 */
const linkSuggestFactory = (api: mw.Api, title: string): ApiSuggest =>
	async (search: string, namespace = 0, subpage?: boolean) => {
		if (subpage) {
			search = title + search; // eslint-disable-line no-param-reassign
		}
		try {
			const [, pages] = await api.get({
				action: 'opensearch',
				search,
				namespace,
				limit: 'max',
			} as ApiOpenSearchParams as Record<string, string>) as [string, string[]];
			if (subpage) {
				const {length} = title;
				return pages.map(page => [page.slice(length)]);
			}
			return namespace === 0 ? pages.map(page => [page]) : pages.map(page => [new mw.Title(page).getMainText()]);
		} catch {
			return [];
		}
	};

/**
 * 获取模板参数建议
 * @param api mw.Api 实例
 * @param page 页面标题
 */
const paramSuggestFactory = (api: mw.Api, page: string): ApiSuggest => async (titles: string) => {
	/* eslint-disable no-param-reassign */
	if (titles.startsWith('/')) {
		titles = page + titles;
	}
	try {
		titles = new mw.Title(titles, 10).getPrefixedDb();
		if (templateParameters.has(titles)) {
			return templateParameters.get(titles)!;
		}
		/* eslint-enable no-param-reassign */
		const {pages} = await api.get({
				action: 'templatedata',
				titles,
				redirects: true,
				converttitles: true,
				lang: mw.config.get('wgUserLanguage'),
			} as TemplateDataApiTemplateDataParams as Record<string, string>) as {
				pages: Record<number, {params: Record<string, TemplateParam>}>;
			},
			params = Object.entries(Object.values(pages)[0]?.params ?? {}),
			result: ApiSuggestions = [];
		for (const [key, {aliases, label}] of params) {
			const detail = label ?? '';
			result.push([key, detail], ...aliases.map((alias): [string, string] => [alias, detail]));
		}
		templateParameters.set(titles, result);
		return result;
	} catch {
		return [];
	}
};

/**
 * 准备建议
 * @param page 页面标题
 */
export default async (page: string): Promise<Record<string, ApiSuggest>> => {
	await mw.loader.using(['mediawiki.api', 'mediawiki.Title']);
	const api = new mw.Api({parameters: {formatversion: 2}});
	return {
		linkSuggest: linkSuggestFactory(api, page),
		paramSuggest: paramSuggestFactory(api, page),
	};
};
