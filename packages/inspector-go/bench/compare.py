"""Per-section parity of the Go analysis against the TS reference.
usage: python3 compare.py ts.json go.json [-v] [--bytes]

Both files are {protocol, finalized, state, diagnostics, stats} as written by
`pikku-inspect` and bench/ref-analyze.mjs. Sections are compared
semantically (key order ignored); --bytes also reports byte-identical sections."""
import json, re, sys
from collections import Counter, defaultdict

TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|\w+|[^\s\w]')


def canon(v):
    """Order-insensitive form: typescript-go orders union members (and so the
    keys of mapped types over them) differently from TS 6, so a type string or
    a schema can differ only in the order of its members."""
    if isinstance(v, str):
        return tuple(sorted(TOKEN.findall(v)))
    if isinstance(v, list):
        return tuple(sorted((canon(x) for x in v), key=repr))
    if isinstance(v, dict):
        return tuple(sorted((k, canon(x)) for k, x in v.items()))
    return v

verbose = "-v" in sys.argv
check_bytes = "--bytes" in sys.argv
paths = [a for a in sys.argv[1:] if not a.startswith("-")]
ref_doc, go_doc = (json.load(open(p)) for p in paths)
ref, go = ref_doc["state"], go_doc["state"]
results = []


def keyed(section, r_entries, g_entries):
    rk, gk = set(r_entries), set(g_entries)
    found = rk & gk
    present, match = Counter(), Counter()
    bad = defaultdict(list)
    whole = 0
    order_only = 0
    for k in found:
        r, g = r_entries[k], g_entries[k]
        if not isinstance(r, dict) or not isinstance(g, dict):
            ok = r == g
            present["<value>"] += 1
            match["<value>"] += ok
            if not ok:
                bad["<value>"].append((k, r, g))
            whole += ok
            continue
        same = True
        for f in set(r) | set(g):
            present[f] += 1
            if r.get(f) == g.get(f):
                match[f] += 1
            else:
                same = False
                bad[f].append((k, r.get(f), g.get(f)))
        whole += same
        if not same and canon(r) == canon(g):
            order_only += 1
    ok = whole == len(rk) == len(gk)
    results.append((section, ok, whole, len(rk), order_only))
    print(f"\n== {section}: ts={len(rk)} go={len(gk)} identical={whole}/{len(rk)}"
          + (f" order-only={order_only}" if order_only else "") + ("" if ok else "  <-- DIFF"))
    if rk - gk:
        print("   missing in go:", sorted(rk - gk)[:12], "..." if len(rk - gk) > 12 else "")
    if gk - rk:
        print("   extra in go:  ", sorted(gk - rk)[:12], "..." if len(gk - rk) > 12 else "")
    for f in sorted(present, key=lambda f: (match[f] / present[f], f)):
        if verbose or match[f] != present[f]:
            print(f"   {f:30s} {match[f]:4d}/{present[f]:<4d}")
            for k, a, b in bad[f][:4]:
                print(f"      {k}: ts={json.dumps(a)[:140]} go={json.dumps(b)[:140]}")


def pairs(v):  # Map serialized as [[k, v], ...]
    return {k: x for k, x in v}


def setof(v):
    return {x: True for x in v}


def http_flat(s):
    return {f"{m} {r}": v for m, routes in s["http"]["meta"].items() for r, v in routes.items()}


def tm(s):
    t = s["functions"]["typesMap"]
    return {**{"map:" + k: v for k, v in t["map"]}, **{"custom:" + k: v for k, v in t["customTypes"]}}


SECTIONS = [
    ("functions.meta", lambda s: s["functions"]["meta"]),
    ("functions.files", lambda s: pairs(s["functions"]["files"])),
    ("functions.typesMap", tm),
    ("http.meta", http_flat),
    ("http.files", lambda s: setof(s["http"]["files"])),
    ("http.metaInputTypes", lambda s: pairs(s["http"]["metaInputTypes"])),
    ("queueWorkers.meta", lambda s: s["queueWorkers"]["meta"]),
    ("queueWorkers.files", lambda s: setof(s["queueWorkers"]["files"])),
    ("mcpEndpoints.toolsMeta", lambda s: s["mcpEndpoints"]["toolsMeta"]),
    ("mcpEndpoints.resourcesMeta", lambda s: s["mcpEndpoints"]["resourcesMeta"]),
    ("mcpEndpoints.promptsMeta", lambda s: s["mcpEndpoints"]["promptsMeta"]),
    ("mcpEndpoints.files", lambda s: setof(s["mcpEndpoints"]["files"])),
    ("agents.agentsMeta", lambda s: s["agents"]["agentsMeta"]),
    ("agents.files", lambda s: s["agents"]["files"]),
    ("scorers.scorersMeta", lambda s: s["scorers"]["scorersMeta"]),
    ("scorers.files", lambda s: s["scorers"]["files"]),
    ("workflows.meta", lambda s: s["workflows"]["meta"]),
    ("workflows.files", lambda s: pairs(s["workflows"]["files"])),
    ("workflows.graphMeta", lambda s: s["workflows"]["graphMeta"]),
    ("workflows.graphFiles", lambda s: pairs(s["workflows"]["graphFiles"])),
    ("rpc.internalMeta", lambda s: s["rpc"]["internalMeta"]),
    ("rpc.internalFiles", lambda s: pairs(s["rpc"]["internalFiles"])),
    ("rpc.exposedMeta", lambda s: s["rpc"]["exposedMeta"]),
    ("rpc.exposedFiles", lambda s: pairs(s["rpc"]["exposedFiles"])),
    ("rpc.invokedFunctions", lambda s: setof(s["rpc"]["invokedFunctions"])),
    ("serviceAggregation.usedFunctions", lambda s: setof(s["serviceAggregation"]["usedFunctions"])),
    ("serviceAggregation.usedMiddleware", lambda s: setof(s["serviceAggregation"]["usedMiddleware"])),
    ("serviceAggregation.usedPermissions", lambda s: setof(s["serviceAggregation"]["usedPermissions"])),
    ("singletonServicesTypeImportMap", lambda s: pairs(s["singletonServicesTypeImportMap"])),
    ("wireServicesTypeImportMap", lambda s: pairs(s["wireServicesTypeImportMap"])),
    ("userSessionTypeImportMap", lambda s: pairs(s["userSessionTypeImportMap"])),
    ("configTypeImportMap", lambda s: pairs(s["configTypeImportMap"])),
    ("singletonServicesFactories", lambda s: pairs(s["singletonServicesFactories"])),
    ("wireServicesFactories", lambda s: pairs(s["wireServicesFactories"])),
    ("configFactories", lambda s: pairs(s["configFactories"])),
    ("serverLifecycleFactories", lambda s: pairs(s["serverLifecycleFactories"])),
    ("wireServicesMeta", lambda s: pairs(s["wireServicesMeta"])),
    ("coreTypeProperties", lambda s: s.get("coreTypeProperties", {})),
    ("schemaLookup", lambda s: pairs(s["schemaLookup"])),
    ("secrets.definitions", lambda s: {d["name"]: d for d in s["secrets"]["definitions"]}),
    ("secrets.files", lambda s: setof(s["secrets"]["files"])),
    ("credentials.definitions", lambda s: {d["name"]: d for d in s["credentials"]["definitions"]}),
    ("variables.definitions", lambda s: {d["name"]: d for d in s["variables"]["definitions"]}),
    ("middleware.definitions", lambda s: s["middleware"]["definitions"]),
    ("middleware.instances", lambda s: s["middleware"]["instances"]),
    ("middleware.tagMiddleware", lambda s: pairs(s["middleware"]["tagMiddleware"])),
    ("middleware.globalFiles", lambda s: setof(s["middleware"]["globalFiles"])),
    ("http.routeMiddleware", lambda s: pairs(s["http"]["routeMiddleware"])),
    ("channelMiddleware.definitions", lambda s: s["channelMiddleware"]["definitions"]),
    ("channelMiddleware.instances", lambda s: s["channelMiddleware"]["instances"]),
    ("channelMiddleware.tagMiddleware", lambda s: pairs(s["channelMiddleware"]["tagMiddleware"])),
    ("agentMiddleware.definitions", lambda s: s["agentMiddleware"]["definitions"]),
    ("permissions.definitions", lambda s: s["permissions"]["definitions"]),
    ("functions.approvalDescriptions", lambda s: s["functions"]["approvalDescriptions"]),
    ("auth", lambda s: {"auth": s["auth"]}),
    ("schemas", lambda s: s["schemas"]),
]
only = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")]
for name, get in SECTIONS:
    if only and not any(name.startswith(o) for o in only):
        continue
    keyed(name, get(ref), get(go))

rd = Counter((d["level"], d.get("code"), d["message"]) for d in ref_doc["diagnostics"])
gd = Counter((d["level"], d.get("code"), d["message"]) for d in go_doc["diagnostics"])
print(f"\n== diagnostics: ts={sum(rd.values())} go={sum(gd.values())} common={sum((rd & gd).values())}")
for d in list((rd - gd).elements())[:8]:
    print("   missing in go:", d)
for d in list((gd - rd).elements())[:8]:
    print("   extra in go:  ", d)

if check_bytes:
    print("\n== byte-identical top-level sections")
    for k in ref:
        if k in go:
            same = json.dumps(ref[k], ensure_ascii=False, separators=(",", ":")) == json.dumps(go[k], ensure_ascii=False, separators=(",", ":"))
            if verbose or not same:
                print(f"   {k:34s} {'same' if same else 'differs'}")

print("\nsummary:", ", ".join(
    f"{n} {'OK' if ok else f'{w}/{t}' + (f' (+{o} order-only)' if o else '')}" for n, ok, w, t, o in results))
