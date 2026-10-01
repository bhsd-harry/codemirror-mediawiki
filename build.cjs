'use strict';

const fs = require('fs'),
	path = require('path'),
	esbuild = require('esbuild'),
	{ReplacableString} = require('@bhsd/nodejs'),
	{version} = require('./package.json');

const langs = fs.readdirSync('i18n').map(file => file.slice(0, -5)),
	{MODE = ''} = process.env;
const /** @type {esbuild.BuildOptions} */ config = {
		charset: 'utf8',
		bundle: true,
		format: 'esm',
		logLevel: 'info',
		plugins: [
			{
				name: 'tree-shaking',
				setup(build) {
					build.onLoad(
						// eslint-disable-next-line require-unicode-regexp
						{filter: /\/(?:commands|highlight|language)\/dist\/index.js$/},
						({path: p}) => {
							const contents = new ReplacableString(fs.readFileSync(p, 'utf8'), p),
								base = path.basename(p.slice(0, -14));
							switch (base) {
								case 'commands':
									contents.replace(
										/(?<=^const segmenter = )(.+?);$/msu,
										'/* #__PURE__ */ (() => $1)();',
									);
									break;
								case 'highlight':
									contents.replace(
										/(?<= = )(tagHighlighter\(\[$.+?^\]\));$/msu,
										'/* #__PURE__ */ (() => $1)();',
									);
									break;
								case 'language':
									contents.replace(
										/(?<=^const marks = )(\{$.+?^\});$/msu,
										'/* #__PURE__ */ (() => ($1))()',
									);
								// no default
							}
							return {contents: contents.input};
						},
					);
				},
			},
		],
		...MODE
			? {
				entryPoints: ['mw/index.ts'],
				outfile: 'build/wiki.js',
				dropLabels: ['GH'],
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

(async () => {
	if (MODE !== 'mw') {
		await esbuild.build(config);
	}
	await esbuild.build({
		...config,
		minify: true,
		target: 'es2019',
		sourcemap: true,
		...minConfigs[MODE],
	});
})();
