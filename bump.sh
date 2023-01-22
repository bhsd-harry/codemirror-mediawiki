#!/usr/local/bin/bash
git add -A
git commit -m "chore: bump version to $1"
git push
git tag $1
git push origin $1