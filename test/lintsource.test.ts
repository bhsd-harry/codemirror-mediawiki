import * as assert from 'assert';
import {Text} from '@codemirror/state';
import {
	pos,
	getRange,
	getWikiLintSource,
	getJsLintSource,
	getCssLintSource,
	getVueLintSource,
	getHTMLLintSource,
	getJsonLintSource,
	getLuaLintSource,
} from '../src/lintsource';
import vue from '../src/vue';
import html from '../src/html';
import {createState, createDispatchableView, mwConfig} from './util';
import './linter';
import type {EditorView} from '@codemirror/view';
import type {LanguageSupport, Language} from '@codemirror/language';

describe('lintsource position transformation', () => {
	it('standalone language', () => {
		const lua = `function test()
	return nil
end`,
			doc = Text.of(lua.split('\n'));
		assert.strictEqual(pos(doc, 2, 2), 17);
	});
	it('embedded language', () => {
		const htmlStr = `<script>
const test = () =>
	null;
</script>`,
			doc = Text.of(htmlStr.split('\n'));
		assert.strictEqual(pos(doc, 1, 6, 9), 14);
		assert.strictEqual(pos(doc, 2, 6, 9), 33);
	});
});

describe('lintsource range transformation', () => {
	it('standalone language', () => {
		const js = `const test = () =>
	null;`,
			doc = Text.of(js.split('\n'));
		assert.deepStrictEqual(getRange(doc, 2, 6), {from: 24, to: 25});
		assert.deepStrictEqual(getRange(doc, 1, 6, 2, 6), {from: 5, to: 24});
	});
	it('embedded language', () => {
		const htmlStr = `<script>
const test = () =>
	null;
</script>`,
			doc = Text.of(htmlStr.split('\n'));
		assert.deepStrictEqual(
			getRange(doc, 2, 6, undefined, undefined, 9, 35),
			{from: 33, to: 34},
		);
		assert.deepStrictEqual(
			getRange(doc, 3, 1, undefined, undefined, 9, 35),
			{from: 35, to: 35},
		);
		assert.deepStrictEqual(
			getRange(doc, 1, 6, 2, 6, 9, 35),
			{from: 14, to: 33},
		);
	});
});

describe('lint sources', () => {
	it('WikiLint', async () => {
		const state = createState('</br><br style="top: 0; top: 0>', []);
		const lintsource = await getWikiLintSource()({}, {} as EditorView);
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				{
					from: 0,
					to: 5,
					message: 'tag that is both closing and self-closing (unmatched-tag)',
					severity: 'error',
					source: 'WikiLint',
					actions: [{name: 'Fix: open'}],
				},
				{
					from: 15,
					to: 30,
					message: 'unclosed quotes (unclosed-quote)',
					severity: 'warning',
					source: 'WikiLint',
					actions: [{name: 'Suggestion: close'}],
				},
				// from WikiParser-Node Stylelint integration
				{
					from: 16,
					to: 19,
					message: 'Unexpected duplicate "top"',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'Fix: declaration-block-no-duplicate-properties'}],
				},
				// from `getWikiLintSource()` Stylelint integration
				{
					from: 16,
					to: 19,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'Fix: Stylelint'}],
				},
			],
		);
		assert.strictEqual(
			await lintsource.fixer!(state.doc, 'unmatched-tag'),
			'<br><br style="top: 0; top: 0>',
		);

		let view = createDispatchableView(
				'</br>',
				[0],
				{changes: {from: 1, to: 2, insert: ''}},
				[],
			),
			diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		view = createDispatchableView(
			'<br style="top: 0; top: 0">',
			[0],
			{changes: {from: 11, to: 18, insert: ''}},
			[],
		);
		diagnostics = await lintsource(view.state);
		diagnostics.find(({message}) => message.endsWith(')'))!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;
	});
	it('ESLint', async () => {
		const state = createState(String.raw`console.log( !!!/[\[]/u );`, []);
		const lintsource = await getJsLintSource();
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				{
					from: 14,
					to: 23,
					message: 'Redundant double negation. (no-extra-boolean-cast)',
					severity: 'error',
					source: 'ESLint',
					actions: [{name: 'fix', tooltip: undefined}],
				},
				{
					from: 18,
					to: 19,
					message: String.raw`Unnecessary escape character: \[. (no-useless-escape)`,
					severity: 'error',
					source: 'ESLint',
					actions: [
						{
							name: 'removeEscape',
							tooltip: 'Remove the `\\`. This maintains the current functionality.',
						},
						{
							name: 'escapeBackslash',
							tooltip: 'Replace the `\\` with `\\\\` to include the actual backslash character.',
						},
					],
				},
			],
		);
		assert.strictEqual(
			await lintsource.fixer!(state.doc, 'no-extra-boolean-cast'),
			String.raw`console.log( !/[\[]/u );`,
		);

		const view = createDispatchableView(
				'console.log( !!!0 );',
				[0],
				{changes: {from: 14, to: 17, insert: '0'}},
				[],
			),
			diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;
	});
	it('StyleLint', async () => {
		const text = '* { top: 0; top: 0 }';
		const state = createState(text, []);
		let lintsource = await getCssLintSource();
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				{
					from: 4,
					to: 7,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'fix'}],
				},
			],
		);
		assert.strictEqual(
			await lintsource.fixer!(state.doc, 'declaration-block-no-duplicate-properties'),
			'* { top: 0 }',
		);

		const view = createDispatchableView(
				text,
				[0],
				{changes: {from: 10, to: 18, insert: ''}},
				[],
			),
			diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		lintsource = await getCssLintSource({'declaration-block-no-duplicate-properties': null});
		assert.deepStrictEqual(
			await lintsource(state),
			[],
		);
	});
	it('Vue', async () => {
		const state = createState(
			`<script>console.log( !!!0 );</script>
<style>* { top: 0; top: 0 }</style>
<p style="top: 0; top: 0">`,
			vue(),
		);
		const lintsource = await getVueLintSource();
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				{
					from: 49,
					to: 52,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'fix'}],
				},
				{
					from: 84,
					to: 87,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'fix'}],
				},
				{
					from: 22,
					to: 25,
					message: 'Redundant double negation. (no-extra-boolean-cast)',
					severity: 'error',
					source: 'ESLint',
					actions: [{name: 'fix', tooltip: undefined}],
				},
			],
		);

		let view = createDispatchableView(
				'<script>console.log( !!!0 );</script>',
				[0],
				{changes: {from: 22, to: 25, insert: '0'}},
				vue(),
			),
			diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		view = createDispatchableView(
			'<style>* { top: 0; top: 0 }</style>',
			[0],
			{changes: {from: 17, to: 25, insert: ''}},
			vue(),
		);
		diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		view = createDispatchableView(
			'<p style="top: 0; top: 0">',
			[0],
			{changes: {from: 10, to: 17, insert: ''}},
			vue(),
		);
		diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;
	});
	it('mixed MediaWiki-HTML', async () => {
		const lang = html(mwConfig) as LanguageSupport & {nestedMWLanguage: Language};
		const state = createState(
			`<script>console.log( !!!0 );</script>
<style>* { top: 0; top: 0 }</style>
<p style="top: 0; top: 0">
<noinclude></br><br style="top: 0; top: 0"></noinclude>`,
			lang,
		);
		const lintsource = await getHTMLLintSource({}, {} as EditorView, lang.nestedMWLanguage);
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				{
					from: 49,
					to: 52,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'fix'}],
				},
				{
					from: 84,
					to: 87,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'fix'}],
				},
				// from Vue Stylelint integration
				{
					from: 128,
					to: 131,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'fix'}],
				},
				{
					from: 22,
					to: 25,
					message: 'Redundant double negation. (no-extra-boolean-cast)',
					severity: 'error',
					source: 'ESLint',
					actions: [{name: 'fix', tooltip: undefined}],
				},
				{
					from: 112,
					to: 117,
					message: 'tag that is both closing and self-closing (unmatched-tag)',
					severity: 'error',
					source: 'WikiLint',
					actions: [{name: 'Fix: open'}],
				},
				// from WikiParser-Node Stylelint integration
				{
					from: 128,
					to: 131,
					message: 'Unexpected duplicate "top"',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'Fix: declaration-block-no-duplicate-properties'}],
				},
				// from `getWikiLintSource()` Stylelint integration
				{
					from: 128,
					to: 131,
					message: 'Unexpected duplicate "top" (declaration-block-no-duplicate-properties)',
					severity: 'error',
					source: 'Stylelint',
					actions: [{name: 'Fix: Stylelint'}],
				},
			],
		);

		let view = createDispatchableView(
				'<script>console.log( !!!0 );</script>',
				[0],
				{changes: {from: 22, to: 25, insert: '0'}},
				lang,
			),
			diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		view = createDispatchableView(
			'<style>* { top: 0; top: 0 }</style>',
			[0],
			{changes: {from: 17, to: 25, insert: ''}},
			lang,
		);
		diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		view = createDispatchableView(
			'<p style="top: 0; top: 0">',
			[0],
			{changes: {from: 10, to: 17, insert: ''}},
			lang,
		);
		diagnostics = await lintsource(view.state);
		// eslint-disable-next-line es-x/no-array-prototype-at
		diagnostics.at(-1)!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		view = createDispatchableView(
			'<noinclude><br style="top: 0; top: 0"></noinclude>',
			[0],
			{changes: {from: 22, to: 29, insert: ''}},
			lang,
		);
		diagnostics = await lintsource(view.state);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;

		view = createDispatchableView(
			'<noinclude></br></noinclude>',
			[0],
			{changes: {from: 12, to: 13, insert: ''}},
			lang,
		);
		diagnostics = await lintsource(view.state);
		const diagnostic = diagnostics[0]!;
		assert.strictEqual(diagnostic.from, 11);
		assert.strictEqual(diagnostic.to, 16);
		diagnostics[0]!.actions![0]!.apply(view, 0, 0);
		await view.dispatched;
	});
	it('JSON', async () => {
		const text = '{ "a": 1, "a": 2';
		const state = createState(text, []);
		const lintsource = await getJsonLintSource();
		assert.deepStrictEqual(
			await lintsource(state),
			[
				{
					from: 11,
					to: 12,
					message: 'Duplicate key "a"',
					severity: 'warning',
				},
				{
					from: 16,
					to: 16,
					message: 'Expected "," or "}" instead of end of input',
					severity: 'error',
				},
			],
		);
	});
	it('Luacheck', async () => {
		const text = 'f()';
		const state = createState(text, []);
		const lintsource = await getLuaLintSource();
		assert.deepStrictEqual(
			await lintsource(state),
			[
				{
					from: 0,
					to: 1,
					message: 'Accessing an undefined global variable',
					severity: 'error',
					source: 'Luacheck',
				},
			],
		);
	});
});
