import {CodeMirror6} from '/codemirror-mediawiki/dist/main.min.js';
import type {Config} from 'wikiparser-node';

declare interface Test {
	desc: string;
	wikitext?: string;
}

(async () => {
	const tests: Test[] = await (await fetch('./test/parserTests.json')).json(),
		key = 'codemirror-mediawiki-done',
		dones = new Set<string>(JSON.parse(localStorage.getItem(key)!) as string[]),
		select = document.querySelector('select')!,
		btn = document.querySelector('button')!,
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
	btn.disabled = !select.value;
	let optgroup: HTMLOptGroupElement;
	for (const [i, {desc, wikitext}] of tests.entries()) {
		if (wikitext === undefined) {
			optgroup = document.createElement('optgroup');
			optgroup.label = desc;
			select.append(optgroup);
		} else if (!dones.has(desc)) {
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
		btn.disabled = false;
	});
	btn.addEventListener('click', () => {
		dones.add(tests[Number(select.value)]!.desc);
		localStorage.setItem(key, JSON.stringify([...dones]));
		select.selectedIndex++;
		select.dispatchEvent(new Event('change'));
	});
})();
