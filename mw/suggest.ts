import type {ApiOpenSearchParams, TemplateDataApiTemplateDataParams} from 'types-mediawiki-api';
import type {ApiSuggest, ApiSuggestions} from '../src/token';

declare interface TemplateParam {
	label: string | null;
	description: string | null;
	aliases: string[];
}

const templateParameters = new Map<string, ApiSuggestions>();

/**
 * 获取维基链接建议
 * @param api mw.Api 实例
 * @param title 页面标题
 */
const linkSuggestFactory = (api: mw.Api, title: string): ApiSuggest => {
	let promise: Promise<ApiSuggestions> | undefined;
	return async (search: string, namespace = 0, subpage?: boolean) => {
		if (subpage) {
			search = title + search; // eslint-disable-line no-param-reassign
		}
		promise ??= (async () => {
			try {
				api.abort();
				const [, pages] = await api.get({
					action: 'opensearch',
					search,
					namespace,
					limit: 'max',
				} satisfies ApiOpenSearchParams) as [string, string[]];
				if (subpage) {
					const {length} = title;
					return pages.map(page => [page.slice(length)]);
				}
				return namespace === 0
					? pages.map(page => [page])
					: pages.map(page => [new mw.Title(page).getMainText()]);
			} catch {
				return [];
			}
		})();
		const result = await promise;
		setTimeout(() => {
			promise = undefined;
		}, 120);
		return result;
	};
};

/**
 * 获取模板参数建议
 * @param api mw.Api 实例
 * @param page 页面标题
 */
const paramSuggestFactory = (api: mw.Api, page: string): ApiSuggest => async (titles: string) => {
	if (!titles || /[|{}<>[\]]/u.test(titles)) {
		return [];
	} else if (titles.startsWith('/')) {
		titles = page + titles; // eslint-disable-line no-param-reassign
	}
	try {
		titles = new mw.Title(titles, 10).getPrefixedDb(); // eslint-disable-line no-param-reassign
		if (templateParameters.has(titles)) {
			return templateParameters.get(titles)!;
		}
		api.abort();
		const {pages} = await api.get({
			action: 'templatedata',
			titles,
			redirects: true,
			converttitles: true,
			lang: mw.config.get('wgUserLanguage'),
		} satisfies TemplateDataApiTemplateDataParams) as {
				pages: Record<number, {description?: string, params: Record<string, TemplateParam>}>;
			},
			[pageObj] = Object.values(pages),
			desc = pageObj?.description,
			params = Object.entries(pageObj?.params ?? {}),
			result: ApiSuggestions = [];
		for (const [key, {aliases, label, description}] of params) {
			const detail = description ?? label ?? '';
			result.push([key, detail], ...aliases.map((alias): [string, string] => [alias, detail]));
		}
		if (desc) {
			result.description = desc;
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
