// src/test-page.ts
import { CodeMirror6 } from "/codemirror-mediawiki/dist/demo.min.js";
(async () => {
  const tests = await (await fetch("./test/parserTests.json")).json(), key = "codemirror-mediawiki-done", dones = new Set(JSON.parse(localStorage.getItem(key))), isGH = location.hostname.endsWith(".github.io"), select = document.querySelector("select"), btn = document.querySelector("button"), textarea = document.querySelector("textarea"), pre = document.querySelector("pre"), config = await (await fetch("/wikiparser-node/config/default.json")).json();
  wikiparse.setConfig(config);
  const cm = new CodeMirror6(textarea, "mediawiki", CodeMirror6.getMwConfig(config));
  Object.assign(globalThis, { cm });
  await wikiparse.highlight(pre, false, true);
  btn.disabled = !select.value;
  if (!isGH) {
    btn.style.display = "";
  }
  let optgroup;
  for (let i = 0; i < tests.length; i++) {
    const { desc, wikitext } = tests[i];
    if (wikitext === void 0) {
      optgroup = document.createElement("optgroup");
      optgroup.label = desc;
      select.append(optgroup);
    } else if (isGH || !dones.has(desc)) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = desc;
      optgroup.append(option);
    }
  }
  select.addEventListener("change", () => {
    const { wikitext, desc } = tests[Number(select.value)];
    cm.setContent(wikitext, true);
    pre.textContent = wikitext;
    pre.classList.remove("wikiparser");
    void wikiparse.highlight(pre, false, true);
    select.selectedOptions[0].disabled = true;
    btn.disabled = false;
    history.replaceState(null, "", `#${encodeURIComponent(desc)}`);
  });
  btn.addEventListener("click", () => {
    dones.add(tests[Number(select.value)].desc);
    localStorage.setItem(key, JSON.stringify([...dones]));
    select.selectedIndex++;
    select.dispatchEvent(new Event("change"));
  });
  addEventListener("hashchange", () => {
    const hash = decodeURIComponent(location.hash.slice(1)), i = tests.findIndex(({ desc }) => desc === hash);
    if (i !== -1) {
      select.value = String(i);
      select.dispatchEvent(new Event("change"));
    }
  });
  dispatchEvent(new HashChangeEvent("hashchange"));
})();
