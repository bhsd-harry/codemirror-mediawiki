'use strict';

const fs = require('fs'),
	esbuild = require('esbuild'),
	{version} = require('./package.json');

const langs = fs.readdirSync('i18n').map(file => file.slice(0, -5)),
	{MODE = ''} = process.env;
const config = {
		charset: 'utf8',
		bundle: true,
		format: 'esm',
		logLevel: 'info',
		...MODE
			? {
				entryPoints: ['mw/index.ts'],
				outfile: 'build/wiki.js',
				define: {
					$LANGS: JSON.stringify(langs),
					$VERSION: JSON.stringify(version),
					$STYLE: JSON.stringify(fs.readFileSync('mediawiki.css', 'utf8').trim()),
				},
			}
			: {
				entryPoints: ['src/index.ts'],
				outfile: 'build/main.js',
			},
	},
	minConfigs = {
		wiki: {
			format: 'iife',
			outfile: 'dist/wiki.min.js',
		},
		mw: {outfile: 'dist/mw.min.js'},
		'': {outfile: 'dist/main.min.js'},
	};

if (MODE !== 'mw') {
	esbuild.buildSync(config);
}
esbuild.buildSync({
	...config,
	minify: true,
	target: 'es2019',
	sourcemap: true,
	...minConfigs[MODE],
});
