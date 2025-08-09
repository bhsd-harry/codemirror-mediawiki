/* eslint-env node */
import * as fs from 'fs';
import * as esbuild from 'esbuild';

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
			},
		}
		: {
			entryPoints: ['src/codemirror.ts'],
			outfile: 'build/main.js',
		},
});
