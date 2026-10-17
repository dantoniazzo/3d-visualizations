#!/bin/bash
# The watcher that fetches Mixamo's exports: the browser pane saves no
# downloads, and each export's presigned S3 link (caught in the page by
# mixamo.js) lives 300 s. Write each link to a file as soon as the page
# gives it, and this curls it within two seconds.
#
#   mixamo-fetch.sh <links-dir> <repo>/assets/people        (run_in_background)
#
# Every 2 s, for each <links-dir>/<kind>__<name>.url — kind `characters`,
# `animations` (the people's clips) or `avatar` (the visitor's own clips, which
# `npm run people -- --avatar-clips` reads from assets/people/avatar/; one named
# `animations__…` would land among the people's clips, and the next
# `npm run people` would plan it for them: blender/import_people.py's CLASSIFY
# reads "Stand To Sit" as a sit pose and "Swimming" as a standing clip) — the
# file holding the one link — it curls the link to
# <dest>/<kind>/<name>.fbx (through a .part file, so a cut download leaves
# nothing that looks whole), appends "ok <kind>/<name>.fbx <bytes>" or
# "FAILED <kind>/<name>.fbx (<why>)" to <links-dir>/fetch.log (and prints it),
# and moves the .url to <links-dir>/done/ or <links-dir>/failed/. A failed one
# is not tried again: its link has most likely expired — export it again.
# It stops when <links-dir>/STOP exists, or after two hours.
#
# <name> is the file's name in assets/people and, for a clip, its name in the
# app ("Sitting Idle"): spaces are fine, slashes are not. An existing .fbx of
# that name is replaced. curl follows no redirects and sends nothing but the
# GET: the link is the whole of the authorisation, so keep <links-dir> in the
# scratch folder, not in the repo.
set -u
# (No apostrophe inside "${…}": macOS's bash 3.2 reads one there as a quote, and swallowed the next line.)
usage="usage: mixamo-fetch.sh <links-dir> <dest: the assets/people folder of the repo>"
links="${1:?$usage}"
dest="${2:?$usage}"
mkdir -p "$links/done" "$links/failed" "$dest/characters" "$dest/animations" "$dest/avatar"
log="$links/fetch.log"
say() { echo "$1" | tee -a "$log"; }
end=$(( $(date +%s) + 7200 ))
say "watching $links -> $dest ($(date '+%H:%M:%S'))"
while [ ! -e "$links/STOP" ] && [ "$(date +%s)" -lt "$end" ]; do
    for file in "$links"/*.url; do
        [ -e "$file" ] || continue
        base="$(basename "$file" .url)"
        kind="${base%%__*}"
        name="${base#*__}"
        if [ "$kind" = "$base" ] || [ -z "$name" ] || { [ "$kind" != characters ] && [ "$kind" != animations ] && [ "$kind" != avatar ]; }; then
            say "FAILED $base (not <characters|animations|avatar>__<name>.url)"
            mv "$file" "$links/failed/"
            continue
        fi
        url="$(tr -d '\r\n' < "$file")"
        out="$dest/$kind/$name.fbx"
        if curl -f -sS --max-time 600 -o "$out.part" "$url" 2> "$links/curl.err" && [ -s "$out.part" ]; then
            mv "$out.part" "$out"
            say "ok $kind/$name.fbx $(wc -c < "$out" | tr -d ' ')"
            mv "$file" "$links/done/"
        else
            rm -f "$out.part"
            say "FAILED $kind/$name.fbx ($(tr -d '\n' < "$links/curl.err" | cut -c1-160))"
            mv "$file" "$links/failed/"
        fi
    done
    sleep 2
done
say "stopped ($(date '+%H:%M:%S'))"
