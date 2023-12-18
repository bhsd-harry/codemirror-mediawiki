/* eslint-env node */
const path = require( 'path' );

module.exports = ( _, { mode } ) => ( {
	mode,
	entry: './src/codemirror.ts',
	output: {
		path: path.resolve( __dirname, 'dist' ),
		filename: `main${ mode === 'production' ? '.min' : '' }.js`,
		library: {
			type: 'module'
		}
	},
	experiments: {
		outputModule: true
	},
	resolve: {
		extensions: [ '.ts' ]
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
		minimize: mode === 'production',
		usedExports: true
	}
} );
