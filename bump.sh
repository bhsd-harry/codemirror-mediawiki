#!/usr/local/bin/bash
if [[ $2 == 'npm' ]]
then
	gsed -i '/"types":/a \\t"type": "module",' package.json
	npm publish --tag "${3-latest}"
	gsed -i '/"type": "module",/d' package.json
elif [[ $2 == 'gh' ]]
then
	gsed -n "/## $1/,/##/{/^## .*/d;/./,\$!d;p}" CHANGELOG.md > release-notes.md
	gh release create "$1-w" --notes-file release-notes.md -t "@bhsd/codemirror-wikitext $1" --verify-tag --latest=false
	rm release-notes.md
else
	gsed -i -E "s/\"version\": \".+\"/\"version\": \"$1\"/" package.json
	npm run lint && npm run build
	if [[ $? -eq 0 ]]
	then
		git add -A
		git commit -m "chore: bump version to $1-w"
		git push
		git tag "$1-w"
		git push origin "$1-w"
	fi
fi
