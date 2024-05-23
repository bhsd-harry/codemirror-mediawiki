import {CodeMirror6} from '/codemirror-mediawiki/dist/main.min.js';
import type {Config} from 'wikiparser-node';

declare interface Test {
	desc: string;
	wikitext?: string;
}

(async () => {
	const tests: Test[] = await (await fetch('/wikiparser-node/test/parserTests.json')).json(),
		select = document.querySelector('select')!,
		textarea = document.querySelector('textarea')!,
		pre = document.querySelector('pre')!;
	Parser.config = await (await fetch('/wikiparser-node/config/default.json')).json();
	const cm = new CodeMirror6(textarea, 'mediawiki', CodeMirror6.getMwConfig(Parser.config as Config));
	Object.assign(window, {cm});
	/** @implements */
	wikiparse.print = (wikitext, include, stage): Promise<[number, string, string][]> => {
		const printed = Parser.parse(wikitext, include, stage).print();
		return Promise.resolve([[stage ?? Infinity, wikitext, printed]]);
	};
	void wikiparse.highlight!(pre, false, true);
	let optgroup: HTMLOptGroupElement;
	for (const [i, {desc, wikitext}] of tests.entries()) {
		if (wikitext === undefined) {
			optgroup = document.createElement('optgroup');
			optgroup.label = desc;
			if (desc === 'legacyMedia') {
				optgroup.hidden = true;
			}
			select.append(optgroup);
		} else {
			const option = document.createElement('option');
			option.value = String(i);
			option.textContent = desc;
			// @ts-expect-error already assigned
			optgroup.append(option);
		}
	}
	select.addEventListener('change', () => {
		const {wikitext} = tests[Number(select.value)]!;
		cm.setContent(wikitext!);
		pre.textContent = wikitext!;
		pre.classList.remove('wikiparser');
		void wikiparse.highlight!(pre, false, true);
		select.selectedOptions[0]!.disabled = true;
	});
})();
