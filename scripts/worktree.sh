#!/usr/bin/env sh
# Creates a worktree on a new branch off origin/main and installs dependencies and git hooks in it.
set -e

branch=${1:?usage: pnpm wt <type>/<slug>}
slug=${branch##*/}
main_checkout=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
dir="$main_checkout/../grifo-worktrees/$slug"

git fetch -q origin main
git worktree add "$dir" -b "$branch" origin/main
cd "$dir"
pnpm install --frozen-lockfile
echo "worktree ready: $(pwd)"
