// src/test-page.ts
import { CodeMirror6 } from "/codemirror-mediawiki/dist/demo.min.js";
import {
  prepareDoneBtn,
  hideOptGroup,
  addOption,
  changeHandler,
  hashChangeHandler,
  inputHandler
} from "/wikiparser-node/extensions/dist/test-page-common.js";
(async () => {
  const tests = await (await fetch("./test/parserTests.json")).json(), key = "codemirror-mediawiki-done", dones = new Set(JSON.parse(localStorage.getItem(key))), input = document.getElementById("search"), select = document.querySelector("select"), btn = document.querySelector("button"), textarea = document.querySelector("textarea"), pre = document.querySelector("pre"), config = await (await fetch("/wikiparser-node/config/default.json")).json();
  const cm = new CodeMirror6(textarea, "mediawiki", CodeMirror6.getMwConfig(config));
  Object.assign(globalThis, { cm });
  wikiparse.setConfig(config);
  await wikiparse.highlight(pre, false, true);
  let optgroup;
  for (let i = 0; i < tests.length; i++) {
    optgroup = addOption(optgroup, select, tests, dones, i);
  }
  hideOptGroup(optgroup);
  select.addEventListener("change", () => {
    cm.setContent(tests[Number(select.value)].wikitext, true);
    changeHandler(pre, btn, select, tests);
  });
  prepareDoneBtn(btn, select, tests, dones, key);
  inputHandler(input, select, dones);
  hashChangeHandler(select, tests);
})();
