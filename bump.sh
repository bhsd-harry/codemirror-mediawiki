#!/usr/local/bin/bash
if [[ $2 == 'npm' ]]
then
	npm run build
	sed -i '' -E "s/\"version\": \".+\"/\"version\": \"$1\"/" package.json
	git add -A
	git commit -m "chore: publish $1 to npm"
	npm publish --tag ${3-latest}
else 
	npm run lint
	if [[ $? -eq 0 ]]
	then
		git add -A
		git commit -m "chore: bump version to $1"
		git push
		git tag $1
		git push origin $1
	fi
fi
