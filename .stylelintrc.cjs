'use strict';

const config = require('@bhsd/code-standard/stylelintrc.cjs');
const [, useBaseline] = config.rules['plugin/use-baseline'];
useBaseline.ignoreSelectors = ['nesting'];

module.exports = {
	...config,
	ignoreFiles: ['mediawiki.css'],
};
