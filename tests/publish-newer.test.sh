#!/usr/bin/env bash
# Run: bash tests/publish-newer.test.sh — checks the semver comparison used to move channel manifests.
set -euo pipefail
eval "$(sed -n '/^newer() {/,/^}/p' "$(dirname "$0")/../scripts/publish-release.sh")"
gt() { newer "$1" "$2" || { echo "FAIL: $1 > $2"; exit 1; }; }
le() { ! newer "$1" "$2" || { echo "FAIL: not $1 > $2"; exit 1; }; }
gt 0.3.0 0.2.9; gt 0.10.0 0.9.0; gt 1.0.0 0.99.99
gt 0.3.0 0.3.0-beta.4; le 0.3.0-beta.4 0.3.0
gt 0.3.0-beta.10 0.3.0-beta.9; le 0.3.0-beta.2 0.3.0-beta.2; le 0.3.0 0.3.0
gt 0.4.0-beta.1 0.3.1; le 0.3.1 0.4.0-beta.1
echo "publish-newer: ok"
