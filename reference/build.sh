#!/bin/sh
# Rebuilds the single-file reference from its parts (order matters).
cd "$(dirname "$0")/source-parts"
cat 1-head.html 2-body.html 3-data.js 3b-data.js 3c-data.js 4-engine.js 4b-engine.js 4c-w0.js 4d-w0b.js 5-levels.js 5b-levels.js 5c-levels.js 5d-levels.js 5e-levels.js 6-render.js 6b-render.js 6c-render.js 6d-w0.js 6e-w0b.js 7a-more.js 7b-w0.js 7c-w0b.js 7-app.js > ../model-to-metal.rebuilt.html
