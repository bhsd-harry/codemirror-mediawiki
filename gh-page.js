import { getMwConfig } from '/wikiparser-node/extensions/dist/gh-page.js';
import { CodeMirror6 } from './dist/main.min.js';
const textarea = document.querySelector('#wpTextbox'), languages = document.querySelectorAll('input[name="language"]'), extensions = [...document.querySelectorAll('input[type="checkbox"]')], indent = document.querySelector('#indent'), cm = new CodeMirror6(textarea), linters = {};
let config, parserConfig;
const init = async (lang) => {
    if (lang === 'mediawiki' || lang === 'html') {
        parserConfig || (parserConfig = await (await fetch('/wikiparser-node/config/default.json')).json());
        config || (config = getMwConfig(parserConfig));
    }
    cm.setLanguage(lang, config);
    if (!(lang in linters)) {
        linters[lang] = await cm.getLinter();
        if (lang === 'mediawiki') {
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
