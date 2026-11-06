#!/usr/bin/env python3
"""Adds the pikku doc pages and prose of f2708c53c to an installed @pikku/cli.
usage: apply.py <installed @pikku/cli real path> [--undo]
Writes are atomic, so a running `pikku doc` sees the old or the new file."""
import json, os, shutil, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
backup = f'{here}/backup'
cli = sys.argv[1].rstrip('/')
surface = f'{cli}/surface.json'
render = f'{cli}/dist/src/functions/surface/render-surface-doc.js'
guides = f'{cli}/dist/src/functions/surface/surface-guides.js'

def put(path, text):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, 'w') as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)

def counts(doc):
    app = doc['entryPoints'][0]['leaves']
    return len(app), sum(len(leaf['symbols']) for leaf in app)

if sys.argv[2:] == ['--undo']:
    for name, path in (('render-surface-doc.js', render), ('surface.json', surface)):
        put(path, open(f'{backup}/{name}').read())
    if os.path.exists(guides):
        os.remove(guides)
    print('undone')
    sys.exit(0)

text = open(render).read()
if 'SURFACE_GUIDES' not in text:
    if os.path.exists(backup):
        sys.exit(f'{backup} already exists: undo, or remove it, first')
    os.makedirs(backup)
    shutil.copy2(render, backup)
    shutil.copy2(surface, backup)
    door = "'  pikku doc <door>      one door: what it exports and the keys you write', "
    edits = [
        ('export class UnknownSurfaceTargetError',
         "import { SURFACE_GUIDES } from './surface-guides.js';\nexport class UnknownSurfaceTargetError"),
        (door, door + "`  pikku doc <topic>     ${SURFACE_GUIDES.map((guide) => guide.names[0]).join(', ')}`, "),
        ('const renderSymbolRow = ', """const renderGuide = (guide) => [
    `${guide.names[0]} — ${guide.title}`,
    '',
    ...guide.points.flatMap((point) => [wrap(point, 78, '  '), '']),
    '  example',
    ...guide.example.split('\\n').map((line) => `    ${line}`),
].join('\\n');
const renderSymbolRow = """),
        ('        return renderLeaf(leaf, ai);\n    }\n    const home = new Map();',
         """        return renderLeaf(leaf, ai);
    }
    const guide = SURFACE_GUIDES.find(({ names }) => names.includes(target));
    if (guide) {
        return renderGuide(guide);
    }
    const home = new Map();"""),
    ]
    for old, new in edits:
        assert text.count(old) == 1, f'render-surface-doc.js: anchor not found: {old[:40]}'
        text = text.replace(old, new)
    shutil.copy2(f'{here}/surface-guides.js', guides)
    os.chmod(guides, 0o644)
    put(render, text)

doc = json.load(open(surface))
before = counts(doc)
additions = json.load(open(f'{here}/additions.json'))
seen = set()
for entry in doc['entryPoints']:
    for leaf in entry['leaves']:
        for symbol in leaf['symbols']:
            add = additions.get(symbol['name'])
            if add:
                seen.add(symbol['name'])
                if not symbol.get('docs', '').endswith(add['docsAppend']):
                    symbol['docs'] = symbol.get('docs', '') + add['docsAppend']
                if 'examples' in add:
                    symbol['examples'] = add['examples']
assert seen == set(additions), f'missing: {set(additions) - seen}'
assert counts(doc) == before
put(surface, json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
print(f'applied: {before[0]} doors, {before[1]} exports')
