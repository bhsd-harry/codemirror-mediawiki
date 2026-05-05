import type {State, Style} from './token';

declare interface Token {
	readonly char?: string | undefined;
	readonly string: string;
	readonly state: State;
	pos: number;
	style: Style;
}

export class MediaWikiData {
	declare readonly tags;
	declare readonly urlProtocols;

	/** 已解析的节点 */
	readonly readyTokens: Token[] = [];

	/** 当前起始位置 */
	oldToken: Token | null = null;

	/** 可能需要回滚的`'''` */
	mark: number | null = null;

	firstSingleLetterWord: number | null = null;
	firstMultiLetterWord: number | null = null;
	firstSpace: number | null = null;

	constructor(tags: string[], urlProtocols: string) {
		this.tags = tags.includes('translate') ? tags.filter(tag => tag !== 'tvar') : tags;
		this.urlProtocols = new RegExp(
			String.raw`^(${this.tags.includes('tvar') ? '<tvar name=[^>]+>' : ''})?${urlProtocols}`,
			'iu',
		);
	}
}
