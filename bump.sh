#!/usr/local/bin/bash
if [[ $2 == 'npm' ]]
then
	npm publish --tag ${3-latest}
else
	sed -i '' -E "s|codemirror-mediawiki@[^/']+|codemirror-mediawiki@$1|g" mw/msg.ts
	npm run lint && npm run build:test && npm run test:real && npm run build && npm run build:gh-page
	if [[ $? -eq 0 ]]
	then
		for x in i18n/* package.json
		do
			sed -i '' -E "s/\"version\": \".+\"/\"version\": \"$1\"/" $x
		done
		git add -A
		git commit -m "chore: bump version to $1"
		git push
		git tag $1
		git push origin $1
	fi
fi
