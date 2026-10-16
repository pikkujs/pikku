"""Per-section parity of the Go inspector bundle against the TS reference.
usage: python3 compare.py ref.json go.json [-v]

Both files hold {functions, http, queueWorkers, typesMap}."""
import json, sys
from collections import Counter, defaultdict

# Written by later TS passes the prototype does not port.
POST = {"singletonServicesOnly"}
verbose = "-v" in sys.argv
ref, go = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))


def compare(section, r_entries, g_entries, ignore=frozenset()):
    rk, gk = set(r_entries), set(g_entries)
    found = rk & gk
    present, match = Counter(), Counter()
    bad = defaultdict(list)
    whole = 0
    for k in found:
        r, g = r_entries[k], g_entries[k]
        same = True
        for f in (set(r) | set(g)) - ignore:
            present[f] += 1
            if r.get(f) == g.get(f):
                match[f] += 1
            else:
                same = False
                bad[f].append((k, r.get(f), g.get(f)))
        whole += same
    tp, tm = sum(present.values()), sum(match.values())
    print(f"\n== {section}: ref={len(rk)} go={len(gk)} found={len(found)} "
          f"identical={whole}/{len(rk)} fields={tm}/{tp}"
          + (f" ({100*tm/tp:.1f}%)" if tp else ""))
    if rk - gk:
        print("   missing in go:", sorted(rk - gk)[:12], "..." if len(rk - gk) > 12 else "")
    if gk - rk:
        print("   extra in go:  ", sorted(gk - rk)[:12], "..." if len(gk - rk) > 12 else "")
    for f in sorted(present, key=lambda f: (match[f] / present[f], f)):
        if verbose or match[f] != present[f]:
            print(f"   {f:30s} {match[f]:4d}/{present[f]:<4d}")
            for k, a, b in bad[f][:4]:
                print(f"      {k}: ts={json.dumps(a)[:120]} go={json.dumps(b)[:120]}")
    return whole, len(rk)


rf, gf = ref["functions"], go["functions"]
# stampAuthHandlerServices (post-processing, needs the auth-handler analysis)
# overwrites the auth handler's services; not ported.
for k, v in rf.items():
    if v.get("name") == "authHandler" and k in gf:
        gf[k] = dict(gf[k], services=v["services"])
        print(f"note: {k}.services is stamped by stampAuthHandlerServices; excluded")
compare("functions", rf, gf, POST)


def flat_http(h):
    return {f"{m} {r}": v for m, routes in h.items() for r, v in routes.items()}


compare("http", flat_http(ref["http"]), flat_http(go["http"]))
# post-process injects synthetic workflow orchestrator / step queues from the
# workflow graphs, which the prototype does not extract.
rq = {k: v for k, v in ref["queueWorkers"].items()
      if not v["pikkuFuncId"].startswith("pikkuWorkflowOrchestrator:") and not k.startswith("wf-step-")}
if len(rq) != len(ref["queueWorkers"]):
    print(f"note: {len(ref['queueWorkers']) - len(rq)} synthetic workflow queues (post-process) excluded")
compare("queueWorkers", rq, go["queueWorkers"])


def tm(t):
    return ({k: v for k, v in t["map"]}, {k: v for k, v in t["customTypes"]})


rm, rc = tm(ref["typesMap"])
gm, gc = tm(go["typesMap"])
compare("typesMap.map", rm, gm)
compare("typesMap.customTypes", rc, gc)
# The order matters to `exists` (first match wins); report it separately.
print("\ntypesMap.map order identical:", [k for k, _ in ref["typesMap"]["map"]] == [k for k, _ in go["typesMap"]["map"]])
