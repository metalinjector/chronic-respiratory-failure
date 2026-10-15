#!/bin/bash
# Two-pass build of the lecture PDF. Usage: ./build.sh [output.pdf]
set -e
cd "$(dirname "$0")"
OUT="${1:-../Лекция_ХДН.pdf}"
node build.js _lecture_p1.html                      # pass 1: HTML with hidden heading markers
node print.js _lecture_p1.html _lecture_p1.pdf      # Chromium print
python3 post.py extract _lecture_p1.pdf pages.json  # heading -> page map
node build.js _lecture_p2.html pages.json           # pass 2: real page numbers in the TOC
node print.js _lecture_p2.html _lecture_p2.pdf
python3 post.py finalize _lecture_p2.pdf pages.json "$OUT"  # strip soft hyphens, running heads, page numbers, outline, metadata
echo "done: $OUT"
