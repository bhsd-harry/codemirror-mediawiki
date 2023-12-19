rm -rf dist/
webpack --mode production
tsc --emitDeclarationOnly
rm dist/gh-page.d.ts
cp src/gh-page.ts src/temp.ts
gsed -i '/import type /d' src/temp.ts
printf '%s\n%s' '// @ts-nocheck' "$(cat src/temp.ts)" > src/temp.ts
tsc --project tsconfig.gh-page.json
rm src/temp.ts
mv temp.js gh-page.js
