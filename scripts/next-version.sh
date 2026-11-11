#!/usr/bin/env bash
# Prints the next release version for a channel: next-version.sh stable|beta
#
# Base = last stable tag (vX.Y.Z), bumped from the Conventional Commits since then:
#   "feat!:" / "BREAKING CHANGE"  -> major (minor while in 0.x)
#   "feat:"                       -> minor
#   anything else                 -> patch
# A higher version written by hand in tauri.conf.json wins (to force e.g. 1.0.0).
# beta appends -beta.N, N = previous beta tags of that version + 1.
set -euo pipefail
channel=${1:?usage: next-version.sh stable|beta}
cd "$(dirname "$0")/.."

declared=$(sed -n 's/^  "version": "\([0-9.]*\).*/\1/p' tauri.conf.json | head -1)
last=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' | grep -vE -- '-' | sort -V | tail -1 || true)

if [ -z "$last" ]; then
  next=$declared # first release: use the declared version as is
else
  IFS=. read -r ma mi pa <<<"${last#v}"
  log=$(git log --format='%s%n%b' "$last..HEAD")
  if grep -qE '^[a-z]+(\([^)]*\))?!:|BREAKING[ -]CHANGE' <<<"$log"; then
    if [ "$ma" = 0 ]; then mi=$((mi + 1)); pa=0; else ma=$((ma + 1)); mi=0; pa=0; fi
  elif grep -qE '^feat(\([^)]*\))?:' <<<"$log"; then
    mi=$((mi + 1)); pa=0
  else
    pa=$((pa + 1))
  fi
  next="$ma.$mi.$pa"
  [ "$(printf '%s\n%s\n' "$next" "$declared" | sort -V | tail -1)" = "$declared" ] && [ "$declared" != "${last#v}" ] && next=$declared
fi

case "$channel" in
  stable) echo "$next" ;;
  beta)
    n=$(git tag -l "v$next-beta.*" | sed 's/.*-beta\.//' | grep -E '^[0-9]+$' | sort -n | tail -1 || true)
    echo "$next-beta.$(( ${n:-0} + 1 ))" ;;
  *) echo "unknown channel: $channel" >&2; exit 1 ;;
esac
