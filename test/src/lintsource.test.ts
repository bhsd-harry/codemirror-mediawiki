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
	getJsoncLintSource,
	getLuaLintSource,
} from '../../dist/lintsource.js';
import vue from '../../dist/vue.js';
import html from '../../dist/html.js';
import {createState, createDispatchableView, mwConfig} from './util.js';
import './linter.js';
import type {EditorView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {LanguageSupport, Language} from '@codemirror/language';
import type {Diagnostic as DiagnosticBase} from '@codemirror/lint';
import type {LintSource} from '../../dist/lintsource';

interface Diagnostic extends Omit<DiagnosticBase, 'actions'> {
	actions?: {name: string, tooltip?: undefined}[];
}

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

const getWikiLintError = (from: number, to: number): Diagnostic => ({
	from,
	to,
	message: 'tag that is both closing and self-closing (unmatched-tag)',
	severity: 'error',
	source: 'WikiLint',
	actions: [{name: 'Fix: open'}],
});

const getStylelintError = (from: number, to: number, wikilint?: boolean, rule = true): Diagnostic => {
	let name: string;
	if (rule) {
		name = wikilint ? 'Fix: Stylelint' : 'fix';
	} else {
		name = 'Fix: declaration-block-no-duplicate-properties';
	}
	return {
		from,
		to,
		message: `Duplicate property "top"${rule ? ' (declaration-block-no-duplicate-properties)' : ''}`,
		severity: 'error',
		source: 'Stylelint',
		actions: [{name}],
	};
};

const getESLintError = (from: number, to: number): Diagnostic => ({
	from,
	to,
	message: 'Redundant double negation. (no-extra-boolean-cast)',
	severity: 'error',
	source: 'ESLint',
	actions: [{name: 'fix', tooltip: undefined}],
});

const viewTest = async (
	doc: string,
	lintsource: LintSource,
	from: number,
	to: number,
	insert = '',
	lang: Extension = [],
): Promise<void> => {
	const view = createDispatchableView(doc, [0], {changes: {from, to, insert}}, lang),
		diagnostics = await lintsource(view.state);
	diagnostics.find(({message}) => message.endsWith(')'))!.actions![0]!.apply(view, 0, 0);
	return view.dispatched;
};

describe('lint sources', () => {
	it('WikiLint', async () => {
		const state = createState('</br><br style="top: 0; top: 0>', []);
		const lintsource = await getWikiLintSource()({}, {} as EditorView);
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				getWikiLintError(0, 5),
				{
					from: 15,
					to: 30,
					message: 'unclosed quotes (unclosed-quote)',
					severity: 'warning',
					source: 'WikiLint',
					actions: [{name: 'Suggestion: close'}],
				},
				// from WikiParser-Node Stylelint integration
				getStylelintError(16, 19, true, false),
				// from `getWikiLintSource()` Stylelint integration
				getStylelintError(16, 19, true),
			],
		);
		assert.strictEqual(
			await lintsource.fixer!(state.doc, 'unmatched-tag'),
			'<br><br style="top: 0; top: 0>',
		);

		await viewTest('</br>', lintsource, 1, 2);
		await viewTest('<br style="top: 0; top: 0">', lintsource, 11, 18);
	});
	it('ESLint', async () => {
		const state = createState(String.raw`console.log( !!!/[\[]/u );`, []);
		const lintsource = await getJsLintSource();
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				getESLintError(14, 23),
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

		await viewTest('console.log( !!!0 );', lintsource, 14, 17, '0');
	});
	it('StyleLint', async () => {
		const text = '* { top: 0; top: 0 }';
		const state = createState(text, []);
		let lintsource = await getCssLintSource();
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[getStylelintError(4, 7)],
		);
		assert.strictEqual(
			await lintsource.fixer!(state.doc, 'declaration-block-no-duplicate-properties'),
			'* { top: 0 }',
		);

		await viewTest(text, lintsource, 10, 18);

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
<p style="top: 0; top: 0">
<style>* { color: v-bind(color); }</style>`,
			vue(),
		);
		const lintsource = await getVueLintSource();
		assert.partialDeepStrictEqual(
			await lintsource(state),
			[
				getStylelintError(49, 52),
				getStylelintError(84, 87),
				getESLintError(22, 25),
			],
		);

		await viewTest('<script>console.log( !!!0 );</script>', lintsource, 22, 25, '0', vue());
		await viewTest('<style>* { top: 0; top: 0 }</style>', lintsource, 17, 25, '', vue());
		await viewTest('<p style="top: 0; top: 0">', lintsource, 10, 17, '', vue());
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
				getStylelintError(49, 52),
				getStylelintError(84, 87),
				// from Vue Stylelint integration
				getStylelintError(128, 131),
				getESLintError(22, 25),
				getWikiLintError(112, 117),
				// from WikiParser-Node Stylelint integration
				getStylelintError(128, 131, true, false),
				// from `getWikiLintSource()` Stylelint integration
				getStylelintError(128, 131, true),
			],
		);

		await viewTest('<script>console.log( !!!0 );</script>', lintsource, 22, 25, '0', lang);
		await viewTest('<style>* { top: 0; top: 0 }</style>', lintsource, 17, 25, '', lang);
		await viewTest('<p style="top: 0; top: 0">', lintsource, 10, 17, '', lang);
		await viewTest(
			'<noinclude><br style="top: 0; top: 0"></noinclude>',
			lintsource,
			22,
			29,
			'',
			lang,
		);
		await viewTest('<noinclude></br></noinclude>', lintsource, 12, 13, '', lang);
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
	it('JSONC', async () => {
		const text = '{\n\t// line comment\n\t"a": 1,\n\t/* block comment */\n\t"a": 2';
		const state = createState(text, []);
		const lintsource = await getJsoncLintSource();
		assert.deepStrictEqual(
			await lintsource(state),
			[
				{
					from: 51,
					to: 52,
					message: 'Duplicate key "a"',
					severity: 'warning',
				},
				{
					from: 56,
					to: 56,
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
					message: 'Accessing an undefined global variable (113)',
					severity: 'error',
					source: 'Luacheck',
				},
			],
		);
	});
});
