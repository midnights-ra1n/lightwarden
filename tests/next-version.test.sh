#!/usr/bin/env bash
# Run: bash tests/next-version.test.sh — exercises scripts/next-version.sh in a throwaway repo.
set -euo pipefail
src=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd "$tmp" && git init -q && git config user.email t@t && git config user.name t
mkdir scripts && cp "$src/scripts/next-version.sh" scripts/
printf '{\n  "version": "0.2.0"\n}\n' > tauri.conf.json
c() { git commit -q --allow-empty -m "$1"; }
eq() { [ "$1" = "$2" ] || { echo "FAIL: expected $2, got $1 ($3)"; exit 1; }; }
v() { scripts/next-version.sh "$1"; }

c "first commit"
eq "$(v stable)" 0.2.0 "first release uses declared version"
eq "$(v beta)" 0.2.0-beta.1 "first beta"
git tag v0.2.0-beta.1; eq "$(v beta)" 0.2.0-beta.2 "beta counter"
git tag v0.2.0
c "fix: bug";            eq "$(v stable)" 0.2.1 "fix -> patch"
c "feat(ssh): agent";    eq "$(v stable)" 0.3.0 "feat -> minor"; eq "$(v beta)" 0.3.0-beta.1 "beta of next minor"
git tag v0.3.0-beta.1;   eq "$(v beta)" 0.3.0-beta.2 "second beta"
c "feat!: new format";   eq "$(v stable)" 0.3.0 "breaking in 0.x -> minor"
git tag v0.3.0
printf '{\n  "version": "1.0.0"\n}\n' > tauri.conf.json
c "chore: release 1.0";  eq "$(v stable)" 1.0.0 "declared version wins"
git tag v1.0.0
c "feat: x";             eq "$(v stable)" 1.1.0 "minor after 1.0"
c "refactor!: y";        eq "$(v stable)" 2.0.0 "breaking -> major"
echo "next-version: ok"
