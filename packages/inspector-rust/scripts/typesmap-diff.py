#!/usr/bin/env python3
"""Differential check of state.functions.typesMap between the two inspectors.

usage: typesmap-diff.py <go bin> <rust bin> <parity out dir>

Runs both binaries on every `<out>/diffs/*.request.json` that parity.ts wrote
and compares every typesMap entry: customTypes (printed type text, so union and
property order) and map. Prints entries Go has that Rust lacks or prints
differently, and the totals.
"""
import json,glob,os,subprocess,sys
GO,RS,OUT=sys.argv[1],sys.argv[2],sys.argv[3].rstrip('/')+'/'
tot=eq=0; mapn=0; mapeq=0; projs=0; bad=[]
for req in sorted(glob.glob(OUT+'diffs/*.request.json')):
    name=os.path.basename(req)[:-13]
    def run(b):
        p=subprocess.run([b,'--stdin'],stdin=open(req),capture_output=True,text=True,timeout=300)
        try: return json.loads(p.stdout)
        except Exception: return None
    g=run(GO); r=run(RS)
    if not g or not r or 'state' not in g or 'state' not in r: print('skip',name); continue
    projs+=1
    gt=g['state']['functions']['typesMap']; rt=r['state']['functions']['typesMap']
    gc=dict(gt['customTypes']); rc=dict(rt['customTypes'])
    for k,v in gc.items():
        tot+=1
        if k in rc and rc[k]==v: eq+=1
        else: bad.append((name,k,v.get('type'),(rc.get(k) or {}).get('type')))
    for k in rc:
        if k not in gc: bad.append((name,k,None,rc[k].get('type')))
    gm=gt['map']; rm=rt['map']; mapn+=len(gm); mapeq+= sum(1 for a,b in zip(gm,rm) if a==b)
    if gm!=rm: bad.append((name,'<map>',len(gm),len(rm)))
print('projects',projs,'customTypes go entries',tot,'equal',eq,'map entries',mapn,'equal',mapeq)
for b in bad[:25]: print(b)
print(len(bad),'differences')
