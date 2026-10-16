"""Field-by-field parity of Go functions meta against the TS reference.
usage: python3 compare.py ref.json go.json [-v]"""
import json, sys
from collections import Counter, defaultdict

# Written by later TS passes, not by addFunctions.
POST = {"singletonServicesOnly"}
ref, go = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
# resolveLatestVersions (a later pass) re-keys the unversioned latest of a
# versioned family as `name@vN`. Undo that on the reference so the slice compares.
for k in [k for k in ref if "@v" in k and k not in go]:
    base = k.split("@v")[0]
    if base in go and go[base].get("sourceFile") == ref[k].get("sourceFile") and "version" not in go[base]:
        r = dict(ref.pop(k)); r["pikkuFuncId"] = base; r.pop("version", None); ref[base] = r
        print(f"note: ref {k} is resolveLatestVersions' re-key of {base}; compared as {base}")
# stampAuthHandlerServices (post-processing) overwrites the auth handler's services.
for k, v in ref.items():
    if v.get("name") == "authHandler" and k in go:
        go[k] = dict(go[k], services=v["services"]); print(f"note: {k}.services is stamped by stampAuthHandlerServices; excluded")
verbose = "-v" in sys.argv
# Entries other visitors add (http agent routes, queues, ...) carry no funcWrapper.
in_slice = {k for k, v in ref.items() if "funcWrapper" in v or "implementationHash" in v}
found = in_slice & set(go)
print(f"ref total={len(ref)} in-slice={len(in_slice)} go={len(go)} found={len(found)} "
      f"({100*len(found)/len(in_slice):.1f}%) extra-in-go={sorted(set(go)-set(ref))}")
print("not found:", sorted(in_slice - set(go)), " out of slice:", sorted(set(ref) - in_slice))
present, match = Counter(), Counter()
bad = defaultdict(list)
for k in found:
    r, g = ref[k], go[k]
    for f in (set(r) | set(g)) - POST:
        present[f] += 1
        if r.get(f) == g.get(f):
            match[f] += 1
        else:
            bad[f].append((k, r.get(f), g.get(f)))
tot_p, tot_m = sum(present.values()), sum(match.values())
print(f"field values matched: {tot_m}/{tot_p} ({100*tot_m/tot_p:.1f}%); whole entries identical: "
      f"{sum(1 for k in found if all(ref[k].get(f)==go[k].get(f) for f in (set(ref[k])|set(go[k]))-POST))}/{len(found)}")
for f in sorted(present, key=lambda f: (match[f]/present[f], f)):
    print(f"  {f:34s} {match[f]:4d}/{present[f]:<4d} {100*match[f]/present[f]:5.1f}%")
    if verbose or match[f] != present[f]:
        for k, a, b in bad[f][:4]:
            print(f"      {k}: ts={json.dumps(a)[:110]} go={json.dumps(b)[:110]}")
