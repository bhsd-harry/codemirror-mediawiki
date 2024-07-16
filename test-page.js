import { CodeMirror6 } from '/codemirror-mediawiki/dist/main.min.js';
(async () => {
    const tests = await (await fetch('./test/parserTests.json')).json(), key = 'codemirror-mediawiki-done', dones = new Set(JSON.parse(localStorage.getItem(key))), select = document.querySelector('select'), btn = document.querySelector('button'), textarea = document.querySelector('textarea'), pre = document.querySelector('pre');
    Parser.config = await (await fetch('/wikiparser-node/config/default.json')).json();
    const cm = new CodeMirror6(textarea, 'mediawiki', CodeMirror6.getMwConfig(Parser.config));
    Object.assign(window, { cm });
    wikiparse.print = (wikitext, include, stage) => {
        const printed = Parser.parse(wikitext, include, stage).print();
        return Promise.resolve([[stage !== null && stage !== void 0 ? stage : Infinity, wikitext, printed]]);
    };
    void wikiparse.highlight(pre, false, true);
    btn.disabled = !select.value;
    let optgroup;
    for (const [i, { desc, wikitext }] of tests.entries()) {
        if (wikitext === undefined) {
            optgroup = document.createElement('optgroup');
            optgroup.label = desc;
            select.append(optgroup);
        }
        else if (!dones.has(desc)) {
            const option = document.createElement('option');
            option.value = String(i);
            option.textContent = desc;
            optgroup.append(option);
        }
    }
    select.addEventListener('change', () => {
        const { wikitext } = tests[Number(select.value)];
        cm.setContent(wikitext);
        pre.textContent = wikitext;
        pre.classList.remove('wikiparser');
        void wikiparse.highlight(pre, false, true);
        select.selectedOptions[0].disabled = true;
        btn.disabled = false;
    });
    btn.addEventListener('click', () => {
        dones.add(tests[Number(select.value)].desc);
        localStorage.setItem(key, JSON.stringify([...dones]));
        select.selectedIndex++;
        select.dispatchEvent(new Event('change'));
    });
})();
