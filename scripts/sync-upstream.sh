#!/bin/bash
set -e
cd "$(dirname "$0")/.."
git fetch upstream
LATEST=$(git tag --sort=-version:refname | grep -v canary | head -1)
echo "Syncing to $LATEST..."
git reset --hard "$LATEST"
python3 -c "
import json
for f in ['server/package.json','ui/package.json','cli/package.json']:
    d=json.load(open(f)); d['version']='$LATEST'.lstrip('v')
    open(f,'w').write(__import__('json').dumps(d,indent=2)+'\n')
"
pnpm install && pm2 restart paperclip
echo "Done: $LATEST"
