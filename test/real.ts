import {performance} from 'perf_hooks';
import parser from './parser';

declare interface MediaWikiPage {
	readonly title: string;
	readonly revisions?: {
		readonly content: string;
		readonly contentmodel: string;
	}[];
}
declare interface SimplePage extends Pick<MediaWikiPage, 'title'> {
	readonly content: string;
}
declare interface MediaWikiResponse {
	readonly query: {
		readonly pages: MediaWikiPage[];
	};
	readonly continue?: Record<string, string>;
}

const apis = [
	// ['LLWiki', 'https://llwiki.org/mediawiki'],
	['维基百科', 'https://zh.wikipedia.org/w'],
	['Wikipedia', 'https://en.wikipedia.org/w'],
] as const;

let c: Record<string, string> | undefined;

/**
 * 获取最近更改的页面源代码
 * @param url api.php网址
 */
const getPages = async (url: string): Promise<SimplePage[]> => {
	const qs = {
			action: 'query',
			format: 'json',
			formatversion: '2',
			errorformat: 'plaintext',
			generator: 'recentchanges',
			grcnamespace: '0|10',
			grclimit: 'max',
			grctype: 'edit|new',
			grctoponly: '1',
			prop: 'revisions',
			rvprop: 'contentmodel|content',
			...c,
		},
		response: MediaWikiResponse = await (await fetch(`${url}?${String(new URLSearchParams(qs))}`)).json();
	c = response.continue; // eslint-disable-line require-atomic-updates
	return response.query.pages.map(({title, revisions}) => ({
		title,
		content: revisions?.[0]?.contentmodel === 'wikitext' && revisions[0].content,
	})).filter((page): page is SimplePage => page.content !== false);
};

(async () => {
	const failures = new Map<string, number>();
	for (const [name, url] of apis) {
		console.log(`开始检查${name}：`);
		let worst: {title: string, duration: number} | undefined;
		c = undefined;
		try {
			/* eslint-disable no-await-in-loop */
			let failed = 0,
				i = 0;
			for (let j = 0; j < 10; j++) {
				for (const {content, title} of await getPages(`${url}/api.php`)) {
					i++;
					process.stdout.write(`\x1B[K${i} ${title}\r`);
					try {
						const start = performance.now();
						parser.parse(content);
						const duration = performance.now() - start;
						if (!worst || duration > worst.duration) {
							worst = {title, duration};
						}
					} catch (e) {
						console.error(`\n解析 ${title} 页面时出错！`, e);
						failed++;
					}
				}
			}
			if (failed) {
				failures.set(name, failed);
			}
			console.log(`\n最耗时页面：${worst!.title} (${worst!.duration.toFixed(3)}ms)`);
			/* eslint-enable no-await-in-loop */
		} catch (e) {
			console.error(`访问${name}的API端口时出错！`, e);
		}
	}
	if (failures.size > 0) {
		let total = 0;
		for (const [name, failed] of failures) {
			console.error(`${name}：${failed} 个页面解析失败！`);
			total += failed;
		}
		throw new Error(`共有 ${total} 个页面解析失败！`);
	}
})();
