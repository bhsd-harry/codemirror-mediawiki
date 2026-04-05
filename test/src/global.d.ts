import type {Parser} from '@lezer/common';
import type {PublicApi} from 'stylelint';
import type {eslint as eslintGlobal} from '@bhsd/eslint-browserify';

declare global {
	module './*' {
		const parser: Parser;
		export default parser;
	}

	const eslint: typeof eslintGlobal;
	const stylelint: PublicApi;
}
