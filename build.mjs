import * as fs from 'fs';
import * as esbuild from 'esbuild';

const langs = fs.readdirSync('i18n').map(file => file.slice(0, -5));

esbuild.buildSync({
	entryPoints: ['mw/index.ts'],
	charset: 'utf8',
	bundle: true,
	format: 'esm',
	outfile: 'build/wiki.js',
	define: {
		$LANGS: JSON.stringify(langs),
	},
	logLevel: 'info',
});
