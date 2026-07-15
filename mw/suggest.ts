import {isWMF} from '../src/constants';
import {getSubpageLevel} from '../src/util';
import {templateData, getParentDir} from './util';
import type {ApiQueryParams, TemplateDataApiTemplateDataParams} from 'types-mediawiki-api';
import type {ApiSuggest, ApiSuggestions, LinkSuggestion, MwConfig, CompletionSectionName} from '../src/token';
import type {TemplateData} from './util';

declare interface Response {
	query?: {
		pages?: {title: string, ns: number, contentmodel?: string}[];
		redirects?: {from: string, to: string}[];
	};
}

const templateParameters = new Map<string, ApiSuggestions>();

/**
 * 获取维基链接建议
 * @param api mw.Api 实例
 * @param title 页面标题
 */
const linkSuggestFactory = (api: mw.Api, title: string): ApiSuggest<LinkSuggestion> => {
	let promise: Promise<ApiSuggestions<LinkSuggestion>> | undefined,
		last: [string, boolean, number, string | undefined] | undefined;
	const f = async (gpssearch: string, subpage = false, gpsnamespace = 0, contentmodel?: string): Promise<
		ApiSuggestions<LinkSuggestion>
	> => {
		if (promise) {
			// 前一个请求未完成，记录最后一次调用的参数以便完成后继续
			last = [gpssearch, subpage, gpsnamespace, contentmodel];
		} else {
			let offset = 0,
				hasParent = false;
			if (subpage) {
				if (gpssearch.startsWith('/')) {
					gpssearch = title + gpssearch;
					offset = title.length;
				} else {
					const length = getSubpageLevel(gpssearch),
						parent = getParentDir(title, length);
					if (!parent) {
						return [];
					}
					gpssearch = parent + gpssearch.slice(length - 1);
					offset = parent.length;
					hasParent = true;
				}
			}
			promise = (async () => {
				try {
					api.abort();
					const params: ApiQueryParams = {
							action: 'query',
							generator: 'prefixsearch',
							gpssearch,
							gpsnamespace,
							...!isWMF && {gpslimit: 'max'},
							...!subpage && {redirects: true},
							...contentmodel && {prop: 'info'},
						},
						{query}: Response = await api.get(params);
					let pages = query?.pages ?? [];
					if (contentmodel) {
						pages = pages.filter(({contentmodel: m}) => m === contentmodel);
					}
					if (subpage) {
						return pages.map(({title: t, ns}) => [t.slice(offset), ns, hasParent ? [t] : undefined]);
					}
					const redirects = query?.redirects ?? [];
					return pages.map(({title: t, ns}) => {
						const target = redirects.find(({to}) => to === t)?.from;
						if (gpsnamespace === 0) {
							// 重定向目标可以位于任何命名空间
							return [t, ns, target!];
						} else if (!target) {
							// 没有重定向，直接返回不含命名空间前缀的标题
							return [new mw.Title(t).getMainText(), ns];
						}
						const targetTitle = new mw.Title(target);
						return ns === gpsnamespace
							// 位于同一命名空间的重定向，返回不含命名空间前缀的标题
							? [new mw.Title(t).getMainText(), ns, targetTitle.getMainText()]
							// 位于不同命名空间的重定向，舍弃重定向目标
							: [targetTitle.getMainText(), targetTitle.getNamespaceId(), [t]];
					});
				} catch {
					return [];
				}
			})();
			// 至少等待 120ms 以避免过于频繁的请求（例如用户快速输入时）
			await new Promise(resolve => {
				setTimeout(resolve, 120);
			});
		}
		const result = await promise;
		promise = undefined; // eslint-disable-line require-atomic-updates
		if (last) {
			// 有更新的请求，继续处理
			const args = last;
			last = undefined;
			return f(...args);
		}
		return result;
	};
	return f;
};

/**
 * 标题规范化
 * @param title 标题
 */
const cmNormalizeTitle = (title: string): string => new mw.Title(title, 10).getPrefixedDb();

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
		titles = cmNormalizeTitle(titles);
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
 * @param linkOnly 是否仅准备链接建议
 */
export default async (page: string, linkOnly?: boolean): Promise<
	Pick<MwConfig, 'linkSuggest' | 'paramSuggest' | 'templateSignature'>
> => {
	await mw.loader.using(['mediawiki.api', 'mediawiki.Title']);
	const api = new mw.Api({parameters: {formatversion: 2}}),
		linkSuggest = linkSuggestFactory(api, page);
	return linkOnly
		? {linkSuggest}
		: {
			linkSuggest,
			paramSuggest: paramSuggestFactory(api, page),
			templateSignature(templateName, parameterName): string | undefined {
				if (!templateName || !parameterName) {
					return undefined;
				}
				const data = templateData.get(cmNormalizeTitle(templateName));
				if (!data) {
					return undefined;
				}
				const parameter = parameterName.slice(0, -1).trim(),
					label = Object.hasOwn(data.params, parameter) && data.params[parameter]!.label;
				return label ? `{{${templateName.trim()}|${parameter}=${label}}}` : undefined;
			},
		};
};
