#!/bin/sh
# Inserts the runtime of the editable-html profile into a document, or refreshes an older one.
# Usage: sh inline-runtime.sh path/to/document.html
# The document needs the marker <!-- doc-runtime --> (just before </body>) or a runtime inserted earlier.
set -e
doc="$1"
rt="$(cd "$(dirname "$0")" && pwd)/runtime.html"
[ -n "$doc" ] && [ -f "$doc" ] || { echo "usage: sh inline-runtime.sh document.html" >&2; exit 2; }
[ -f "$rt" ] || { echo "runtime.html not found next to this script" >&2; exit 2; }
tmp="$doc.runtime.$$"
if awk -v rt="$rt" '
  function emit(  l) { while ((getline l < rt) > 0) print l; close(rt) }
  skip { if (index($0, "<!-- doc-runtime:end -->")) { skip = 0; emit(); done = 1 } ; next }
  index($0, "<!-- doc-runtime:start") { skip = 1; next }
  !done && (i = index($0, "<!-- doc-runtime -->")) {
    pre = substr($0, 1, i - 1); post = substr($0, i + 20)
    if (pre ~ /[^ \t]/) print pre
    emit(); done = 1
    if (post ~ /[^ \t\r]/) print post
    next
  }
  { print }
  END { exit done ? 0 : 3 }
' "$doc" > "$tmp"; then
  mv "$tmp" "$doc"
  echo "doc-runtime 0.2 inserted into $doc"
else
  rm -f "$tmp"
  echo "no <!-- doc-runtime --> marker (or earlier runtime) in $doc" >&2
  exit 1
fi
