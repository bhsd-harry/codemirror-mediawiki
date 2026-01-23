import type {ApiSuggest, ApiSuggestions} from './token';

export const linkSuggest: ApiSuggest<string> = (s, _, ns) => {
	if (ns === 0) {
		return [[`${s} (article)`], [`${s} (user)`]];
	}
	const colon = s.indexOf(':');
	return [[colon === -1 ? s : `${s.slice(colon + 1)} (${s.slice(0, colon).toLowerCase()})`]];
};

export const paramSuggest: ApiSuggest = s => Object.assign(
	s.includes(':')
		? []
		: [
			[['param1'], '', '', 'Deprecated'],
			[['param2', 'p2'], 'another parameter', 'a required parameter', 'Required'],
			[['prm3'], '', 'an optional parameter', 'Optional'],
			[['prm4'], '4th parameter', '', 'Optional'],
		] as ApiSuggestions,
	{description: 'Example template'},
);
