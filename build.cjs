'use strict';

const fs = require('fs'),
	esbuild = require('esbuild'),
	{version} = require('./package.json');

const langs = fs.readdirSync('i18n').map(file => file.slice(0, -5));

esbuild.buildSync({
	charset: 'utf8',
	bundle: true,
	format: 'esm',
	logLevel: 'info',
	...process.env.MODE === 'wiki'
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
});
