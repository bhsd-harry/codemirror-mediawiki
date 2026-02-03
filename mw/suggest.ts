import {templateData} from './util';
import type {ApiOpenSearchParams, TemplateDataApiTemplateDataParams} from 'types-mediawiki-api';
import type {ApiSuggest, ApiSuggestions, MwConfig, CompletionSectionName} from '../src/token';
import type {TemplateData} from './util';

const templateParameters = new Map<string, ApiSuggestions>();

/**
 * 获取维基链接建议
 * @param api mw.Api 实例
 * @param title 页面标题
 */
const linkSuggestFactory = (api: mw.Api, title: string): ApiSuggest<string> => {
	let promise: Promise<ApiSuggestions<string>> | undefined;
	return async (search: string, subpage?: boolean, namespace = 0) => {
		if (subpage) {
			search = title + search;
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
 * 标题规范化
 * @param title 标题
 */
const normalizeTitle = (title: string): string => new mw.Title(title, 10).getPrefixedDb();

/**
 * 获取模板参数建议
 * @param api mw.Api 实例
 * @param page 页面标题
 */
const paramSuggestFactory = (api: mw.Api, page: string): ApiSuggest => async (titles: string, enable = true) => {
	if (!titles || /[|{}<>[\]]/u.test(titles)) {
		return [];
	} else if (titles.startsWith('/')) {
		titles = page + titles;
	}
	try {
		titles = normalizeTitle(titles);
		if (templateParameters.has(titles)) {
			return templateParameters.get(titles)!;
		}
		let pageObj: TemplateData | undefined;
		if (templateData.has(titles)) {
			pageObj = templateData.get(titles);
		} else if (enable) {
			api.abort();
			const {pages} = await api.get({
				action: 'templatedata',
				titles,
				redirects: true,
				converttitles: true,
				lang: mw.config.get('wgUserLanguage'),
			} satisfies TemplateDataApiTemplateDataParams) as {pages: Record<number, TemplateData>};
			[pageObj] = Object.values(pages);
			templateData.set(titles, pageObj);
		} else {
			return [];
		}
		const desc = pageObj?.description,
			params = Object.entries(pageObj?.params ?? {}),
			result: ApiSuggestions = [];
		for (const [key, {aliases, label, description, required, suggested, deprecated}] of params) {
			let section: CompletionSectionName = 'Optional';
			if (required) {
				section = 'Required';
			} else if (suggested) {
				section = 'Suggested';
			} else if (deprecated) {
				section = 'Deprecated';
			}
			result.push([[key, ...aliases], label ?? '', description ?? '', section]);
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
export default async (page: string): Promise<Pick<MwConfig, 'linkSuggest' | 'paramSuggest' | 'templateSignature'>> => {
	await mw.loader.using(['mediawiki.api', 'mediawiki.Title']);
	const api = new mw.Api({parameters: {formatversion: 2}});
	return {
		linkSuggest: linkSuggestFactory(api, page),
		paramSuggest: paramSuggestFactory(api, page),
		templateSignature(templateName, parameterName): string | undefined {
			if (!templateName || !parameterName) {
				return undefined;
			}
			const data = templateData.get(normalizeTitle(templateName)),
				parameter = parameterName.slice(0, -1).trim(),
				label = data?.params[parameter]?.label;
			return label ? `{{${templateName.trim()}|${parameter}=${label}}}` : undefined;
		},
	};
};
