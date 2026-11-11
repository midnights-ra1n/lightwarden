#!/usr/bin/env bash
# CI step run once every platform build has uploaded to the draft release:
#   1. builds the final updater manifest from the draft's latest.json,
#   2. publishes the release (creating the tag),
#   3. points the channel manifest(s) at it, but only if it is newer than what they announce.
# Env: GH_TOKEN, REPO (owner/name), TAG, RELEASE_ID, CHANNEL (stable|beta), SHA
set -euo pipefail
: "${GH_TOKEN:?}" "${REPO:?}" "${TAG:?}" "${RELEASE_ID:?}" "${CHANNEL:?}" "${SHA:?}"
work=$(mktemp -d)
cd "$work"

assets=$(gh api "repos/$REPO/releases/$RELEASE_ID/assets" --paginate)
asset() { gh api -H "Accept: application/octet-stream" "repos/$REPO/releases/assets/$1"; }
id_of() { jq -r --arg n "$1" '.[] | select(.name == $n) | .id' <<<"$assets" | head -1; }
name_like() { jq -r --arg s "$1" '.[] | select(.name | endswith($s)) | .name' <<<"$assets" | head -1; }

lid=$(id_of latest.json)
[ -n "$lid" ] || { echo "::error::latest.json missing from the draft release"; exit 1; }
asset "$lid" > latest.json

base="https://github.com/$REPO/releases/download/$TAG/"
# Draft asset URLs point at "untagged-…": rewrite every URL to the final tag.
jq --arg base "$base" '.platforms |= map_values(.url |= ($base + (split("/") | last)))' latest.json > manifest.json

# Make sure each Linux package type has its own entry, so a .deb/.rpm install never gets an AppImage.
for kind in appimage:.AppImage deb:.deb rpm:.rpm; do
  key="linux-x86_64-${kind%%:*}"; ext="${kind#*:}"
  jq -e --arg k "$key" '.platforms[$k]' manifest.json >/dev/null && continue
  pkg=$(name_like "$ext"); sig=$(name_like "$ext.sig")
  [ -n "$pkg" ] && [ -n "$sig" ] || continue
  asset "$(id_of "$sig")" > sig.txt
  jq --arg k "$key" --arg url "$base$pkg" --rawfile sig sig.txt '.platforms[$k] = {signature: $sig, url: $url}' manifest.json > m.tmp && mv m.tmp manifest.json
done

echo "Manifest platforms:"; jq -r '.platforms | keys[]' manifest.json
for need in linux-x86_64 windows-x86_64 darwin-aarch64 darwin-x86_64; do
  jq -e --arg k "$need" '.platforms[$k] // .platforms[$k + "-appimage"] // .platforms[$k + "-nsis"] // .platforms[$k + "-app"]' manifest.json >/dev/null \
    || { echo "::error::no update package for $need"; exit 1; }
done

# by id: a leftover draft with the same tag must never be the one published
stable=$([ "$CHANNEL" = stable ] && echo true || echo false)
gh api -X PATCH "repos/$REPO/releases/$RELEASE_ID" -F draft=false -F prerelease=$([ "$stable" = true ] && echo false || echo true) \
  -f make_latest="$stable" --jq .html_url

# Channel manifests live on a fixed pre-release so the updater URL never changes.
if ! gh release view channels -R "$REPO" >/dev/null 2>&1; then
  gh release create channels -R "$REPO" --prerelease --latest=false --target "$SHA" \
    --title "Update channels" --notes "Manifests read by the Lightwarden updater (stable.json, beta.json). Do not delete."
fi

# semver "a > b" (a release beats its own pre-releases)
newer() {
  node -e '
    const p = (v) => { const [core, pre] = v.split("-"); return [...core.split(".").map(Number), pre]; };
    const [a, b] = [p(process.argv[1]), p(process.argv[2])];
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) process.exit(a[i] > b[i] ? 0 : 1);
    if (!a[3] || !b[3]) process.exit(!a[3] && b[3] ? 0 : 1);
    const [x, y] = [a[3].split("."), b[3].split(".")];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if (x[i] === undefined) process.exit(1); if (y[i] === undefined) process.exit(0);
      const [n, m] = [Number(x[i]), Number(y[i])];
      if (x[i] !== y[i]) process.exit((isNaN(n) || isNaN(m)) ? (x[i] > y[i] ? 0 : 1) : (n > m ? 0 : 1));
    }
    process.exit(1);' "$1" "$2"
}

version=$(jq -r .version manifest.json); version=${version#v}
targets=beta; [ "$CHANNEL" = stable ] && targets="stable beta" # beta users also get newer stables
upload=()
for ch in $targets; do
  cid=$(gh api "repos/$REPO/releases/tags/channels" --jq ".assets[] | select(.name == \"$ch.json\") | .id" || true)
  if [ -n "$cid" ]; then
    current=$(asset "$cid" | jq -r .version); current=${current#v}
    if ! newer "$version" "$current"; then echo "$ch.json stays on $current (>= $version)"; continue; fi
  fi
  cp manifest.json "$ch.json"; upload+=("$ch.json")
done
[ ${#upload[@]} -eq 0 ] || gh release upload channels "${upload[@]}" -R "$REPO" --clobber
echo "Published $TAG; updated: ${upload[*]:-none}"
