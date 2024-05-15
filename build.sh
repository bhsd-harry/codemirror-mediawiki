printf '%s\n%s' '// @ts-nocheck' "$(cat src/gh-page.ts)" > src/temp-1.ts
printf '%s\n%s' '// @ts-nocheck' "$(cat src/test-page.ts)" > src/temp-2.ts
tsc --project tsconfig.gh-page.json
rm src/temp-*.ts
mv temp-1.js gh-page.js
mv temp-2.js test-page.js
