#!/usr/bin/env python3
"""Backports pikku check and the watcher onto an older installed @pikku/cli.
usage: watch-check-overlay.py <built packages/cli/dist> <installed @pikku/cli real path>"""
import json, os, re, shutil, sys
src, dst = sys.argv[1], sys.argv[2].rstrip('/') + '/dist'
for f in ['bin/pikku.js', 'src/utils/warm-typecheck.js', 'src/utils/watch-status.js',
          'src/utils/watch-loop.js', 'src/utils/tsc-check.js',
          'src/functions/commands/check.js', 'src/functions/commands/watch.js',
          'src/functions/commands/codegen-child.js', 'src/functions/commands/all.js',
          'src/utils/codegen-failure.js', 'src/utils/stale-leaves.js', 'src/utils/codegen-lock.js',
          'src/utils/route-tree.js', 'src/utils/run-script.js',
          'src/services/cli-logger.service.js',
          '.pikku/schemas/schemas/CheckInput.schema.json',
          '.pikku/schemas/schemas/CheckResult.schema.json']:
    shutil.copy(f'{src}/{f}', f'{dst}/{f}')
w = f'{dst}/src/functions/workflows/all.workflow.js'
t = open(w).read()
if "'status.json'" not in t:
    t2 = t.replace("readdirSync(outDir).some((entry) => entry !== RUN_RECORDS_DIR",
                   "readdirSync(outDir).some((entry) => entry !== 'status.json' && entry !== RUN_RECORDS_DIR")
    assert t2 != t, 'all.workflow.js: hasGeneratedOutput not found'
    open(w, 'w').write(t2)
def merge(path, get):
    a, b = [json.load(open(f'{r}/{path}')) for r in (src, dst)]
    get(b)['check'] = get(a)['check']
    json.dump(b, open(f'{dst}/{path}', 'w'))
merge('.pikku/cli/pikku-cli-wirings-meta.gen.json', lambda m: m['programs']['pikku']['commands'])
merge('.pikku/function/pikku-functions-meta.gen.json', lambda m: m)
c = f'{dst}/.pikku/cli/pikku-cli-channel.js'
s, new = open(c).read(), open(f'{src}/.pikku/cli/pikku-cli-channel.js').read()
if 'commands/check.js' not in s:
    block = re.search(r"            'check': \{.*?\n            \},\n", new, re.S).group(0)
    s = "import { check } from '../../src/functions/commands/check.js';\n" + s
    s = s.replace("            'db.check': {", block + "            'db.check': {", 1)
    open(c, 'w').write(s)
r = f'{dst}/.pikku/schemas/register.gen.js'
s, new = open(r).read(), open(f'{src}/.pikku/schemas/register.gen.js').read()
if 'CheckResult' not in s:
    s = ''.join(l + '\n' for l in new.split('\n') if re.search(r"\b(as CheckInput|as CheckResult|'CheckInput'|'CheckResult')", l)) + s
    open(r, 'w').write(s)
w = f'{dst}/src/cli.wiring.js'
s, new = open(w).read(), open(f'{src}/src/cli.wiring.js').read()
if 'renderCheck' not in s:
    block = re.search(r"        check: pikkuCLICommand\(\{.*?\n        \}\),\n", new, re.S).group(0)
    s = "import { check, renderCheck } from './functions/commands/check.js';\n" + s
    s = s.replace("        dev: pikkuCLICommand({", block + "        dev: pikkuCLICommand({", 1)
    open(w, 'w').write(s)
