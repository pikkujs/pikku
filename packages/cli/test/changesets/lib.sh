#!/bin/bash
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PIKKU_JS=${PIKKU_JS:-$HERE/../../dist/bin/pikku.js}
SCRATCH=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/changesets-test.XXXXXX")" && pwd -P)
trap 'rm -rf "$SCRATCH"' EXIT

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@test
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@test
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null

PASSED=0
FAILED=0
CURRENT=""

pk() {
  node "$PIKKU_JS" "$@" 2>&1 | grep -v -e '^$' -e 'pikku ::'
  return "${PIPESTATUS[0]}"
}

scenario() {
  CURRENT=$1
  echo "· $1"
}

pass() { PASSED=$((PASSED + 1)); }

fail() {
  FAILED=$((FAILED + 1))
  echo "  ✗ $CURRENT: $1"
  [[ -n ${2:-} ]] && echo "$2" | sed 's/^/      /'
}

expect_contains() {
  if [[ $1 == *"$2"* ]]; then pass; else fail "${3:-expected “$2”}" "$1"; fi
}

expect_absent() {
  if [[ $1 != *"$2"* ]]; then pass; else fail "${3:-did not expect “$2”}" "$1"; fi
}

expect_eq() {
  if [[ $1 == "$2" ]]; then pass; else fail "${3:-expected “$2”, got “$1”}"; fi
}

expect_ok() {
  local out
  if out=$("$@"); then pass; else fail "expected success: $*" "$out"; fi
}

expect_refused() {
  local out
  if out=$("$@"); then fail "expected refusal: $*" "$out"; else pass; fi
  REFUSAL=$out
}

fresh_repo() {
  REPO=$SCRATCH/${1:-repo}
  rm -rf "$REPO" "$REPO-changesets" "$REPO.git"
  mkdir -p "$REPO"
  cd "$REPO" || exit 1
  git init -q -b main
  echo base >f.txt
  git add f.txt
  git commit -qm base
}

with_remote() {
  git init -q --bare -b main "$REPO.git"
  git remote add origin "$REPO.git"
  git push -q -u origin main
}

file_changes() {
  for title in "$@"; do pk changes file --title "$title" >/dev/null; done
}

store() { echo "$(cd "$(git rev-parse --git-common-dir)" && pwd)/pikku-changes.json"; }

group_of() {
  node -e "const s=require(process.argv[1]);const g=s.groups.find(g=>g.title===process.argv[2]);process.stdout.write(g?g.groupId:'')" "$(store)" "$1"
}

lease_live() {
  node -e "const s=require(process.argv[1]);const g=s.groups.find(g=>g.title===process.argv[2]);process.stdout.write(String(!!g&&new Date(g.claimExpiresAt)>new Date()))" "$(store)" "$1"
}

commit_change() {
  local n=$1 content=${2:-change $1} file=${3:-f.txt}
  mkdir -p "$(dirname "$file")"
  echo "$content" >"$file"
  git add "$file"
  git commit -qm "#$n change $n" -m "Change: #$n"
}

trailers() { git log -1 --format='%(trailers:only,unfold)' "${1:-HEAD}"; }

finish() {
  echo "$(basename "$0"): $PASSED passed, $FAILED failed"
  [[ $FAILED -eq 0 ]]
}
