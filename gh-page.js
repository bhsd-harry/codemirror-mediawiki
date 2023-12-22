import { CodeMirror6 } from './dist/main.min.js';
(() => {
    const textarea = document.querySelector('#wpTextbox'), languages = document.querySelectorAll('input[name="language"]'), extensions = document.querySelectorAll('input[type="checkbox"]'), indent = document.querySelector('#indent'), cm = new CodeMirror6(textarea), linters = {};
    let config;
    const init = async (lang) => {
        if (lang === 'mediawiki') {
            config !== null && config !== void 0 ? config : (config = await (await fetch('config.json')).json());
        }
        cm.setLanguage(lang, config);
        if (!(lang in linters)) {
            linters[lang] = await cm.getLinter();
            if (lang === 'mediawiki') {
                wikiparse.setConfig(await (await fetch('/wikiparser-node/config/default.json')).json());
            }
            cm.lint(linters[lang]);
        }
    };
    const prefer = () => {
        const preferred = [...extensions].filter(({ checked }) => checked).map(({ id }) => id);
        cm.prefer(preferred);
    };
    const indentChange = () => {
        cm.setIndent(indent.value || '\t');
    };
    for (const input of languages) {
        input.addEventListener('change', () => {
            void init(input.id);
        });
        if (input.checked) {
            void init(input.id);
        }
    }
    for (const extension of extensions) {
        extension.addEventListener('change', prefer);
    }
    prefer();
    indent.addEventListener('change', indentChange);
    indentChange();
    Object.assign(window, { cm });
})();
