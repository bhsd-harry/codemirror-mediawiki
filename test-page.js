import { CodeMirror6 } from '/codemirror-mediawiki/dist/main.min.js';
(async () => {
    const tests = await (await fetch('/wikiparser-node/test/parserTests.json')).json(), select = document.querySelector('select'), textarea = document.querySelector('textarea'), pre = document.querySelector('pre');
    Parser.config = await (await fetch('/wikiparser-node/config/default.json')).json();
    const cm = new CodeMirror6(textarea, 'mediawiki', CodeMirror6.getMwConfig(Parser.config));
    Object.assign(window, { cm });
    wikiparse.print = (wikitext, include, stage) => {
        const printed = Parser.parse(wikitext, include, stage).print();
        return Promise.resolve([[stage !== null && stage !== void 0 ? stage : Infinity, wikitext, printed]]);
    };
    void wikiparse.highlight(pre, false, true);
    let optgroup;
    for (const [i, { desc, wikitext }] of tests.entries()) {
        if (wikitext === undefined) {
            optgroup = document.createElement('optgroup');
            optgroup.label = desc;
            if (desc === 'legacyMedia') {
                optgroup.hidden = true;
            }
            select.append(optgroup);
        }
        else {
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
    });
})();
