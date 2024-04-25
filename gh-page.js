import { CodeMirror6 } from '/codemirror-mediawiki/dist/main.min.js';
(() => {
    if (!location.pathname.startsWith('/codemirror-mediawiki')) {
        return;
    }
    const textarea = document.querySelector('#wpTextbox'), languages = document.querySelectorAll('input[name="language"]'), extensions = [...document.querySelectorAll('input[type="checkbox"]')], indent = document.querySelector('#indent'), mediawikiOnly = ['escape', 'tagMatching'], cm = new CodeMirror6(textarea), linters = {};
    let config, parserConfig;
    const init = async (lang) => {
        const isMediaWiki = lang === 'mediawiki', display = isMediaWiki ? '' : 'none';
        for (const id of mediawikiOnly) {
            document.getElementById(id).closest('.fieldLayout').style.display = display;
        }
        if (isMediaWiki || lang === 'html') {
            parserConfig || (parserConfig = await (await fetch('/wikiparser-node/config/default.json')).json());
            config || (config = CodeMirror6.getMwConfig(parserConfig));
        }
        cm.setLanguage(lang, config);
        if (!(lang in linters)) {
            linters[lang] = await cm.getLinter();
            if (isMediaWiki) {
                wikiparse.setConfig(parserConfig);
            }
            if (linters[lang]) {
                cm.lint(linters[lang]);
            }
        }
    };
    const prefer = function () {
        cm.prefer({ [this.id]: this.checked });
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
    cm.prefer(extensions.filter(({ checked }) => checked).map(({ id }) => id));
    indent.addEventListener('change', indentChange);
    indentChange();
    Object.assign(window, { cm });
})();
