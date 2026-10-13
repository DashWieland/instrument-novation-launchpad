#!/bin/sh
# Copy choir into a dash_website checkout as components/choir/, the way the
# Choral Hurdy-Gurdy is vendored there. The site copy is never edited by hand:
# change it here, commit, and run this again.
#
#   tools/vendor-to-site.sh /path/to/dash_website
#
# Only the modules choir/mount.js imports are copied (no tests, tools, kit
# pages, Omen Life, or the standalone page's site-tokens.css; the site has the
# real tokens). The directory layout is kept, so the relative imports resolve
# unchanged.
set -eu
SITE="${1:?usage: tools/vendor-to-site.sh /path/to/dash_website}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$SITE/components/choir"
COMMIT="$(git -C "$HERE" rev-parse --short HEAD)"
BRANCH="$(git -C "$HERE" rev-parse --abbrev-ref HEAD)"
if [ -n "$(git -C "$HERE" status --porcelain -- choir kit vendor)" ]; then
  echo "uncommitted changes under choir/, kit/ or vendor/: commit first, so the site copy names a real commit" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST/choir" "$DEST/kit" "$DEST/vendor/choral-counterpoint"
cp "$HERE"/choir/mount.js "$HERE"/choir/harmonizer.js "$HERE"/choir/layout.js "$HERE"/choir/keys.js \
   "$HERE"/choir/trip.js "$HERE"/choir/output.js "$HERE"/choir/choir.css "$DEST/choir/"
cp "$HERE"/kit/grid.js "$HERE"/kit/launchpad.js "$HERE"/kit/renderer.js "$HERE"/kit/twin.js "$DEST/kit/"
cp "$HERE"/vendor/choral-counterpoint/engine.js "$HERE"/vendor/choral-counterpoint/tables.js \
   "$HERE"/vendor/choral-counterpoint/log1p.js "$HERE"/vendor/choral-counterpoint/audio.js \
   "$HERE"/vendor/choral-counterpoint/LICENSE "$DEST/vendor/choral-counterpoint/"

cat > "$DEST/README.md" <<EOF
# choir (vendored)

Copied from [DashWieland/instrument-novation-launchpad](https://github.com/DashWieland/instrument-novation-launchpad)
at \`$COMMIT\` (branch \`$BRANCH\`) by \`tools/vendor-to-site.sh\`. **Don't edit these files here**: change them
in that repo and run the script again, or the next copy silently reverts you.

- \`choir/mount.js\` is the entry point: \`mountChoir(container)\` returns \`{ dispose, retheme }\`
  (the shell is \`components/Choir.tsx\`). \`choir/choir.css\` reads the site's tokens only.
- \`kit/\` is the Launchpad Mini over Web MIDI, plus its on-screen twin.
- \`vendor/choral-counterpoint/\` is the chorale engine and organ, itself vendored from
  [choral-counterpoint](https://github.com/DashWieland/choral-counterpoint) \`47ad95a\` with one appended
  \`export\` line (see that repo's README). It's a separate copy from \`components/hurdygurdy/\`'s:
  choir needs the extra exports, and only \`/choir\` loads it.
EOF
echo "copied choir @ $COMMIT into $DEST"
