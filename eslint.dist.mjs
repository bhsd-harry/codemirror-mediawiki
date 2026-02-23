import {dist} from '@bhsd/code-standard';

export default [
	dist,
	{
		rules: {
			'es-x/no-resizable-and-growable-arraybuffers': 0,
			'es-x/no-set-prototype-intersection': 0,
		},
	},
];
