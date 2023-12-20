cp $1 src/temp.ts
gsed -i '/import type /d' src/temp.ts
printf '%s\n%s' '// @ts-nocheck' "$(cat src/temp.ts)" > src/temp.ts
tsc --project tsconfig.gh-page.json
rm src/temp.ts
mv mw/dist/temp.js $2
