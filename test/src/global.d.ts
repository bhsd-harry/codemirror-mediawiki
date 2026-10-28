import type {PublicApi} from 'stylelint';
import type {eslint as eslintGlobal} from '@bhsd/eslint-browserify';

declare global {
	const eslint: typeof eslintGlobal;
	const stylelint: PublicApi;
}
