import { CodeMirror6 } from '/codemirror-mediawiki/dist/main.min.js';
(async () => {
    const tests = await (await fetch('/wikiparser-node/test/parserTests.json')).json(), select = document.querySelector('select'), textarea = document.querySelector('textarea'), container = document.getElementById('frame'), seen = new Set(), parserConfig = await (await fetch('/wikiparser-node/config/default.json')).json(), cm = new CodeMirror6(textarea, 'mediawiki', CodeMirror6.getMwConfig(parserConfig));
    Object.assign(window, { cm });
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
    const findUnique = (html) => {
        var _a, _b;
        const temp = new Set();
        for (const ele of (_a = html.match(/<\w.*?>/gu)) !== null && _a !== void 0 ? _a : []) {
            const mt = /<(\w+(?=[\s/>]))(?:.*(\sclass="[^"]+"))?/u.exec(ele), tag = `<${mt[1]}${(_b = mt[2]) !== null && _b !== void 0 ? _b : ''}>`;
            if (!seen.has(tag)) {
                temp.add(tag);
            }
        }
        return temp;
    };
    select.addEventListener('change', () => {
        const { wikitext, html } = tests[Number(select.value)];
        cm.setContent(wikitext || '');
        container.innerHTML = html;
        for (const img of container.querySelectorAll('img[src]')) {
            img.src = '/wikiparser-node/assets/bad-image.svg';
            img.removeAttribute('srcset');
        }
        select.selectedOptions[0].disabled = true;
        const tags = findUnique(html);
        for (const tag of tags) {
            seen.add(tag);
        }
    });
    container.addEventListener('click', e => {
        e.preventDefault();
    }, { capture: true });
    document.body.addEventListener('keydown', e => {
        if (e.metaKey && e.key === 'ArrowDown') {
            e.preventDefault();
            const { selectedIndex, options } = select;
            for (let i = selectedIndex + 1; i < options.length; i++) {
                if (!options[i].disabled) {
                    const tags = findUnique(tests[i - 1].html);
                    if (tags.size > 0) {
                        select.selectedIndex = i;
                        select.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }
        }
    });
})();
