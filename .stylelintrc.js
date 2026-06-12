import config from '@bhsd/code-standard/stylelint';

const [, useBaseline] = config.rules['plugin/use-baseline'];
useBaseline.ignoreSelectors = ['nesting'];

export default {
	...config,
	ignoreFiles: ['mediawiki.css'],
};
