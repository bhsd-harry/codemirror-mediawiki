'use strict';

/* eslint-env node */
const path = require( 'path' );

module.exports = {
	mode: 'production',
	entry: './src/codemirror.ts',
	output: {
		path: path.resolve( __dirname, 'dist' ),
		filename: 'main.min.js'
	},
	resolve: {
		extensions: [
			'.ts'
		]
	},
	plugins: [],
	module: {
		rules: [
			{
				test: /\.ts$/,
				loader: 'esbuild-loader',
				options: {
					target: 'es2018'
				}
			}
		]
	},
	optimization: {
		minimize: true,
		usedExports: true
	},
	performance: {
		// Size violations for prod builds fail; development builds are unchecked.
		hints: 'error',

		// Minified uncompressed size limits for chunks / assets and entrypoints. Keep these numbers
		// up-to-date and rounded to the nearest 10th of a kibibyte so that code sizing costs are
		// well understood. Related to bundlesize minified, gzipped compressed file size tests.
		maxAssetSize: 350.0 * 1024,
		maxEntrypointSize: 350.0 * 1024
	}
};
