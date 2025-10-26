import type {ApiSuggest} from './token';

export const linkSuggest: ApiSuggest = (s, _, ns) => {
	if (ns === 0) {
		return [[`${s} (article)`], [`${s} (user)`]];
	}
	const colon = s.indexOf(':');
	return [[colon === -1 ? s : `${s.slice(colon + 1)} (${s.slice(0, colon).toLowerCase()})`]];
};

export const paramSuggest: ApiSuggest = s => Object.assign(
	s.includes(':')
		? []
		: [['param1'], ['param2', 'another parameter']] as [string, string?][],
	{description: 'Example template'},
);
