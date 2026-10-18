#!/bin/bash
# Parallel builders, each in its own copy, merged back with git merge-file
# against a pristine base (review-rounds.md, step 3). Two kinds of copy:
#
#   copy-merge.sh blender-copy <scratch> <name>
#       <scratch>/<name>/blender: blender/ copied from the base; its
#       export_furniture.py writes to <scratch>/<name>/glb (OUT, with a
#       catalog.json of its own) and reads the repo's catalogue, so
#       `export_furniture.py -- <prefix>` run in the copy rebuilds those pieces
#       there and touches nothing in the repo. The base, <scratch>/base/blender,
#       is made by the first copy. Look at and measure the copy's pieces with
#       models/ (views.py and the measurement scripts take --glb-dir).
#   copy-merge.sh gen-copy <scratch> <name> <space>
#       <scratch>/gen-<name>/scripts/spaces/<space>: the generator copied from
#       the base (<scratch>/base/scripts/spaces/<space>, made by the first
#       copy), with <scratch>/gen-<name>/public linked to the repo's (furnish.js
#       reads ../../../public/models/furniture/catalog.json). LINKS="public
#       shared" links more of the repo's top level, for a generator that
#       imports from it. The checkers take the copy with their --gen=, --src
#       or --gen-dir flags (checks/README.md).
#   copy-merge.sh merge-blender <scratch> <name> [<name> ...]
#   copy-merge.sh merge-gen <scratch> <space> <name> [<name> ...]
#       Each copy's changed files merged into the repo in turn: git merge-file
#       <repo file> <base file> <copy file> (repo = ours, base = the common
#       ancestor, the copy = theirs), so later copies merge onto earlier ones.
#       export_furniture.py's two redirect lines are put back first. A file
#       new in a copy is added if the repo hasn't one; a file deleted in a
#       copy is reported, not deleted. Each repo file is backed up under
#       <scratch>/merge-backup/<time>/ before it is written. Conflicts are
#       left in the file as <<<<<<< repo / >>>>>>> <name> and listed; exit 1.
#       DRY=1 does all of it in a copy of the repo's tree under
#       <scratch>/merge-dry/<time>/ instead (kept, to read), the repo untouched.
#   copy-merge.sh diff <scratch> <name> [<space>]
#       What a copy changed against its base (a blender copy, or with <space>
#       a generator copy), redirect lines put back. Run it first when resuming
#       a builder after a break.
#
# The repo is three folders above this script, or $REPO (point it at a
# throwaway checkout to try a merge). Copies are made from the base, never
# from the repo, so every copy shares one ancestor; a new copy whose base no
# longer matches the repo (something was merged or edited since) is refused —
# merge or drop the copies made from it, then use a new scratch folder or
# remove <scratch>/base/<what>. Merging is unaffected: it is three-way.
# After merge-blender, rebuild the merged pieces once with `npm run
# furniture -- <prefix>` (the only step that writes the real catalogue);
# after merge-gen, import the generator and reseed (scene-safety.md).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${REPO:-$(cd "$HERE/../../.." && pwd)}"
BLENDER_BIN="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
EXCLUDES=(--exclude __pycache__ --exclude '*.pyc' --exclude .DS_Store --exclude '*.blend1' --exclude out/)
MARK="# copy-merge.sh redirect"
STAMP="$(date +%Y%m%d-%H%M%S)-$$"

die() { echo "copy-merge.sh: $*" >&2; exit 2; }
usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 2; }
abs() { mkdir -p "$1" && (cd "$1" && pwd); }
check_name() { [[ "$1" =~ ^[A-Za-z0-9_-]+$ && "$1" != base ]] || die "bad copy name '$1' (letters, digits, - and _; not 'base')"; }

# Files under a tree, relative, without build litter.
files() { (cd "$1" && find . -type f ! -path '*/__pycache__/*' ! -name '*.pyc' ! -name .DS_Store ! -name '*.blend1' ! -path './out/*' | sed 's|^\./||' | sort); }

make_base() {  # make_base <repo-tree> <base-tree>
    if [[ -d "$2" ]]; then
        if ! diff -rq -x __pycache__ -x '*.pyc' -x .DS_Store -x '*.blend1' -x out "$1" "$2" > /dev/null; then
            die "$2 no longer matches $1 (merged since?). Merge or drop the copies made from it, then use a new scratch folder or remove $2."
        fi
    else
        mkdir -p "$2"
        rsync -a "${EXCLUDES[@]}" "$1/" "$2/"
        echo "base: $2"
    fi
}

# Point a Blender copy's export_furniture.py at its own glb/ and the repo's catalogue.
redirect() {  # redirect <export_furniture.py> <glb-dir>
    python3 - "$1" "$2" "$REPO/public/models/furniture/catalog.json" "$MARK" <<'PY'
import re, sys
path, out, cat, mark = sys.argv[1:]
s = open(path).read()
s, n1 = re.subn(r'^OUT = .*$', lambda m: f'OUT = "{out}"  {mark}', s, count=1, flags=re.M)
s, n2 = re.subn(r'^(\s*)with open\(os\.path\.join\(OUT, "catalog\.json"\)\) as f:$',
                lambda m: f'{m.group(1)}with open("{cat}") as f:  {mark}', s, count=1, flags=re.M)
if n1 != 1 or n2 != 1:
    sys.exit(f"export_furniture.py has changed: found {n1} OUT line(s) and {n2} catalogue read(s); redirect it by hand")
open(path, "w").write(s)
PY
}

# The copy's export_furniture.py with the base's two lines back in place of the redirect.
normalise() {  # normalise <base file> <copy file> <out file>
    python3 - "$1" "$2" "$3" "$MARK" <<'PY'
import sys
base, mine, out, mark = sys.argv[1:]
b = open(base).read().splitlines(keepends=True)
orig_out = next(l for l in b if l.startswith("OUT = "))
orig_read = next(l for l in b if 'with open(os.path.join(OUT, "catalog.json")) as f:' in l)
res = []
for line in open(mine).read().splitlines(keepends=True):
    if mark in line:
        line = orig_out if line.startswith("OUT = ") else orig_read
    res.append(line)
open(out, "w").write("".join(res))
if any(mark in l for l in res):
    sys.exit("a redirect line is left in " + out)
PY
}

# merge_tree <label> <base-tree> <copy-tree> <repo-tree> [<norm-file> for export_furniture.py]
CONFLICTED=()
merge_tree() {
    local label="$1" base="$2" copy="$3" repo="$4" norm="${5:-}" f theirs rc clean=0 changed=0
    [[ -d "$copy" ]] || die "no copy at $copy"
    echo "== $label"
    while IFS= read -r f; do
        theirs="$copy/$f"
        [[ -n "$norm" && "$f" == export_furniture.py ]] && theirs="$norm"
        if [[ ! -f "$base/$f" ]]; then
            if [[ ! -f "$repo/$f" ]]; then
                mkdir -p "$(dirname "$repo/$f")"; cp "$theirs" "$repo/$f"; echo "   added  $f"
            elif cmp -s "$theirs" "$repo/$f"; then
                echo "   new    $f (the repo already has the same file)"
            else
                echo "   CONFLICT $f: new in $label and different in the repo — merge by hand"
                CONFLICTED+=("$repo/$f")
            fi
            changed=$((changed + 1))
            continue
        fi
        cmp -s "$base/$f" "$theirs" && continue
        changed=$((changed + 1))
        if [[ ! -f "$repo/$f" ]]; then
            echo "   CONFLICT $f: changed in $label, gone from the repo"
            CONFLICTED+=("$repo/$f")
            continue
        fi
        if [[ -z "${DRY:-}" ]]; then
            mkdir -p "$(dirname "$BACKUP/$f")"
            [[ -f "$BACKUP/$f" ]] || cp "$repo/$f" "$BACKUP/$f"
        fi
        set +e
        git merge-file -L repo -L base -L "$label" "$repo/$f" "$base/$f" "$theirs"
        rc=$?
        set -e
        if [[ $rc -eq 0 ]]; then
            echo "   merged $f"; clean=$((clean + 1))
        elif [[ $rc -gt 0 && $rc -lt 128 ]]; then
            echo "   CONFLICT $f: $rc conflict(s)"; CONFLICTED+=("$repo/$f")
        else
            echo "   ERROR  $f: git merge-file exit $rc"; CONFLICTED+=("$repo/$f")
        fi
    done < <(files "$copy")
    while IFS= read -r f; do
        [[ -f "$copy/$f" ]] || echo "   deleted in $label: $f (kept in the repo)"
    done < <(files "$base")
    echo "   $changed file(s) changed in $label, $clean merged cleanly"
}

# Where the merge writes: the repo's tree, or under DRY=1 a copy of it.
target() {  # target <repo-tree> <scratch> <rel>
    if [[ -n "${DRY:-}" ]]; then
        local t="$2/merge-dry/$STAMP/$3"
        mkdir -p "$t"
        rsync -a "${EXCLUDES[@]}" "$1/" "$t/"
        echo "$t"
    else
        echo "$1"
    fi
}

report() {  # report <target> <hint>
    [[ -n "${DRY:-}" ]] && echo "DRY run: merged into $1 (kept to read); the repo is untouched"
    if [[ ${#CONFLICTED[@]} -gt 0 ]]; then
        echo "CONFLICTS in ${#CONFLICTED[@]} file(s):"
        printf '   %s\n' "${CONFLICTED[@]}"
        grep -n '^<<<<<<< \|^>>>>>>> ' "${CONFLICTED[@]}" 2>/dev/null | head -20 || true
        [[ -z "${DRY:-}" && -d "$BACKUP" ]] && echo "backups: $BACKUP"
        exit 1
    fi
    [[ -z "${DRY:-}" && -d "$BACKUP" ]] && echo "backups: $BACKUP"
    [[ -z "${DRY:-}" ]] && echo "$2"
    exit 0
}

cmd="${1:-}"; [[ -n "$cmd" ]] || usage; shift
case "$cmd" in
blender-copy)
    [[ $# -eq 2 ]] || usage
    S="$(abs "$1")"; name="$2"; check_name "$name"
    [[ -f "$REPO/blender/export_furniture.py" ]] || die "no blender/export_furniture.py under $REPO"
    make_base "$REPO/blender" "$S/base/blender"
    C="$S/$name"
    [[ -e "$C/blender" ]] && die "$C/blender exists: a builder's work — pick another name or remove it"
    mkdir -p "$C/blender" "$C/glb"
    rsync -a "$S/base/blender/" "$C/blender/"
    redirect "$C/blender/export_furniture.py" "$C/glb" || { rm -rf "$C"; exit 2; }
    cat <<EOF
copy:   $C/blender  (export_furniture.py: OUT -> $C/glb, catalogue read from the repo)
export: cd $C/blender && "$BLENDER_BIN" --background --python export_furniture.py -- <id-prefix>
look:   "$BLENDER_BIN" --background --python $HERE/models/views.py -- $C/views --glb-dir $C/glb <id> ...
        node $HERE/models/sheet.mjs $C/views $C/sheets
merge:  $0 merge-blender $S $name
EOF
    ;;
gen-copy)
    [[ $# -eq 3 ]] || usage
    S="$(abs "$1")"; name="$2"; space="$3"; check_name "$name"
    [[ -d "$REPO/scripts/spaces/$space" ]] || die "no scripts/spaces/$space under $REPO"
    make_base "$REPO/scripts/spaces/$space" "$S/base/scripts/spaces/$space"
    for l in ${LINKS:-public}; do [[ -e "$S/base/$l" ]] || ln -s "$REPO/$l" "$S/base/$l"; done
    C="$S/gen-$name"
    [[ -e "$C/scripts/spaces/$space" ]] && die "$C/scripts/spaces/$space exists: a builder's work — pick another name or remove it"
    mkdir -p "$C/scripts/spaces/$space"
    rsync -a "$S/base/scripts/spaces/$space/" "$C/scripts/spaces/$space/"
    for l in ${LINKS:-public}; do [[ -e "$C/$l" ]] || ln -s "$REPO/$l" "$C/$l"; done
    cat <<EOF
copy:   $C/scripts/spaces/$space  (links: ${LINKS:-public} -> the repo's)
import: node -e "import('$C/scripts/spaces/$space/index.js').then(() => console.log('ok'))"
check:  the checkers' generator-copy flags (--gen=, --src, --gen-dir) with $C/scripts/spaces/$space
merge:  $0 merge-gen $S $space $name
EOF
    ;;
merge-blender)
    [[ $# -ge 2 ]] || usage
    S="$(abs "$1")"; shift
    B="$S/base/blender"; [[ -d "$B" ]] || die "no base at $B"
    BACKUP="$S/merge-backup/$STAMP/blender"
    TGT="$(target "$REPO/blender" "$S" blender)"
    for name in "$@"; do
        check_name "$name"
        C="$S/$name/blender"; [[ -d "$C" ]] || die "no copy at $C"
        normalise "$B/export_furniture.py" "$C/export_furniture.py" "$S/$name/export_furniture.norm.py"
        merge_tree "$name" "$B" "$C" "$TGT" "$S/$name/export_furniture.norm.py"
    done
    report "$TGT" "next: npm run furniture -- <prefix> (once, for every prefix merged), then npm run build"
    ;;
merge-gen)
    [[ $# -ge 3 ]] || usage
    S="$(abs "$1")"; space="$2"; shift 2
    B="$S/base/scripts/spaces/$space"; [[ -d "$B" ]] || die "no base at $B"
    BACKUP="$S/merge-backup/$STAMP/spaces/$space"
    TGT="$(target "$REPO/scripts/spaces/$space" "$S" "spaces/$space")"
    for name in "$@"; do
        check_name "$name"
        merge_tree "gen-$name" "$B" "$S/gen-$name/scripts/spaces/$space" "$TGT"
    done
    report "$TGT" "next: node -e \"import('./scripts/spaces/$space/index.js').then(() => console.log('ok'))\", the checkers, then the seed (.claude/skills/build-property-space/scene-safety.md)"
    ;;
diff)
    [[ $# -ge 2 ]] || usage
    S="$(abs "$1")"; name="$2"; space="${3:-}"
    set +e
    if [[ -n "$space" ]]; then
        diff -ru -x __pycache__ "$S/base/scripts/spaces/$space" "$S/gen-$name/scripts/spaces/$space"
    else
        T="$(mktemp -d)"
        rsync -a "${EXCLUDES[@]}" "$S/$name/blender/" "$T/"
        normalise "$S/base/blender/export_furniture.py" "$S/$name/blender/export_furniture.py" "$T/export_furniture.py"
        diff -ru -x __pycache__ -x '*.pyc' "$S/base/blender" "$T" | sed "s|$T|$S/$name/blender|g"
        rm -rf "$T"
    fi
    exit 0
    ;;
*) usage ;;
esac
