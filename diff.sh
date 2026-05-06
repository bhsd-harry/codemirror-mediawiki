#!/usr/local/bin/bash
if [[ -z "$1" ]]
then
	git diff -w --color-moved --minimal --diff-filter=ad npm wikitext -- src/*.ts \
	| diff2html -i stdin -F diff.html
else
	git diff -w --color-moved --minimal npm wikitext "$1"
fi
