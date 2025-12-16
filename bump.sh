#!/usr/local/bin/bash
if [[ $2 == 'npm' ]]
then
	gsed -i '/"types":/a \\t"type": "module",' package.json
	npm publish --tag "${3-latest}"
	gsed -i '/"type": "module",/d' package.json
elif [[ $2 == 'gh' ]]
then
	gsed -n "/## $1/,/##/{/^## .*/d;/./,\$!d;p}" CHANGELOG.md > release-notes.md
	gh release create "$1" --notes-file release-notes.md -t "v$1" --verify-tag --latest="${3-true}"
	rm release-notes.md
else
	for x in i18n/* package.json
	do
		sed -i '' -E "s/\"version\": \".+\"/\"version\": \"$1\"/" "$x"
	done
	npm run lint && npm run build:test && npm run test:real && npm run build
	if [[ $? -eq 0 ]]
	then
		git add -A
		git commit -m "chore: bump version to $1"
		git push
		git tag "$1"
		git push origin "$1"
	fi
fi
