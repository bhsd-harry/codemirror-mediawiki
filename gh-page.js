import { CodeMirror6 } from '/codemirror-mediawiki/dist/main.min.js';
const fromEntries = (entries, obj) => {
    for (const entry of entries) {
        obj[entry] = true;
    }
};
export const getMwConfig = (config) => {
    const mwConfig = {
        tags: {},
        tagModes: {
            ref: 'text/mediawiki',
        },
        doubleUnderscore: [{}, {}],
        functionSynonyms: [config.parserFunction[0], {}],
        urlProtocols: `${config.protocol}|//`,
        nsid: config.nsid,
    };
    fromEntries(config.ext, mwConfig.tags);
    fromEntries(config.doubleUnderscore[0].map(s => `__${s}__`), mwConfig.doubleUnderscore[0]);
    fromEntries(config.doubleUnderscore[1].map(s => `__${s}__`), mwConfig.doubleUnderscore[1]);
    fromEntries(config.parserFunction.slice(2).flat(), mwConfig.functionSynonyms[0]);
    fromEntries(config.parserFunction[1], mwConfig.functionSynonyms[1]);
    return mwConfig;
};
(() => {
    if (!location.pathname.startsWith('/codemirror-mediawiki')) {
        return;
    }
    const textarea = document.querySelector('#wpTextbox'), languages = document.querySelectorAll('input[name="language"]'), extensions = [...document.querySelectorAll('input[type="checkbox"]')], indent = document.querySelector('#indent'), escape = document.getElementById('escape').closest('.fieldLayout'), codeFolding = document.getElementById('codeFolding').closest('.fieldLayout'), cm = new CodeMirror6(textarea), linters = {};
    let config, parserConfig;
    const init = async (lang) => {
        const isMediaWiki = lang === 'mediawiki';
        escape.style.display = isMediaWiki ? '' : 'none';
        codeFolding.style.display = isMediaWiki ? '' : 'none';
        if (isMediaWiki || lang === 'html') {
            parserConfig || (parserConfig = await (await fetch('/wikiparser-node/config/default.json')).json());
            config || (config = getMwConfig(parserConfig));
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
