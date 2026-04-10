import type {ApiSuggest, ApiSuggestions} from './token';

export const linkSuggest: ApiSuggest<[string, number, string?]> = (s, _, ns = 0) => {
	if (ns === 0) {
		return [[`${s} (article)`, 0], ['Alice (user)', 0, `${s} (user)`]];
	}
	const colon = s.indexOf(':');
	return [[colon === -1 ? s : `${s.slice(colon + 1)} (${s.slice(0, colon).toLowerCase()})`, ns]];
};

export const paramSuggest: ApiSuggest = s => Object.assign(
	s.includes(':')
		? []
		: [
			[['parameter without detail or info'], '', '', 'Deprecated'],
			[
				['parameter with detail and info', 'argument with detail and info'],
				'2nd parameter',
				'a required parameter',
				'Required',
			],
			[['parameter with info', 'argument with info'], '', 'a suggested parameter', 'Suggested'],
			[['parameter with detail'], '4th parameter', '', 'Optional'],
		] as ApiSuggestions,
	{description: 'Example template'},
);

export const templateSignature = (templateName: string | null, parameterName: string): string | undefined => {
	if (!templateName || !parameterName) {
		return undefined;
	}
	const parameter = parameterName.slice(0, -1).trim();
	let label = '';
	switch (parameter) {
		case 'parameter with detail and info':
		case 'argument with detail and info':
			label = '2nd parameter';
			break;
		case 'parameter with detail':
			label = '4th parameter';
		// no default
	}
	return label && `{{${templateName.trim()}|${parameter}=${label}}}`;
};
