package visit

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func mustOJSON(t *testing.T, s string) *ojson {
	t.Helper()
	v, err := parseOJSON([]byte(s))
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return v
}

func writeFiles(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for p, content := range files {
		full := filepath.Join(root, p)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestOJSONRoundTripKeepsKeyOrder(t *testing.T) {
	in := `{"z":1,"a":{"y":[1,"two",null,true],"b":{}},"m":[],"s":"<&>"}`
	v := mustOJSON(t, in)
	if got := string(v.raw()); got != in {
		t.Errorf("round trip\n got %s\nwant %s", got, in)
	}
	if keys := v.obj.Keys(); !reflect.DeepEqual(keys, []string{"z", "a", "m", "s"}) {
		t.Errorf("keys = %v", keys)
	}
	c := v.clone()
	c.get("a").set("y", ojsonString("changed"))
	c.set("new", ojsonString("x"))
	if string(v.raw()) != in {
		t.Errorf("clone shares state with the original: %s", v.raw())
	}
	if got := string(c.raw()); got != `{"z":1,"a":{"y":"changed","b":{}},"m":[],"s":"<&>","new":"x"}` {
		t.Errorf("clone = %s", got)
	}
}

func TestOJSONTruthyMatchesJS(t *testing.T) {
	for in, want := range map[string]bool{
		`""`: false, `"x"`: true, `0`: false, `1`: true, `null`: false,
		`false`: false, `true`: true, `[]`: true, `{}`: true,
	} {
		if got := mustOJSON(t, in).truthy(); got != want {
			t.Errorf("truthy(%s) = %v, want %v", in, got, want)
		}
	}
	var missing *ojson
	if missing.truthy() || missing.get("x") != nil || missing.has("x") {
		t.Error("nil ojson should read as undefined")
	}
	if got := mustOJSON(t, `["a",1,"b"]`).strings(); !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Errorf("strings() = %v", got)
	}
}

func TestSplitPackageSpecifier(t *testing.T) {
	for in, want := range map[string][2]string{
		"pkg":                    {"pkg", ""},
		"pkg/a/b.json":           {"pkg", "a/b.json"},
		"@scope/pkg":             {"@scope/pkg", ""},
		"@scope/pkg/.pikku/x.js": {"@scope/pkg", ".pikku/x.js"},
	} {
		if p, s := splitPackageSpecifier(in); p != want[0] || s != want[1] {
			t.Errorf("split(%q) = %q, %q", in, p, s)
		}
	}
}

func TestResolveExports(t *testing.T) {
	exports := mustOJSON(t, `{
		".": {"import": "./esm/index.js", "require": "./cjs/index.js"},
		"./package.json": "./package.json",
		"./.pikku/*": "./dist/.pikku/*",
		"./.pikku/function/*": {"types": "./x.d.ts", "default": "./fn/*"},
		"./private/*": null,
		"./fallback": ["./nope", {"node": "./fb.js"}]
	}`)
	for target, want := range map[string]string{
		".":                            "./cjs/index.js",
		"./package.json":               "./package.json",
		"./.pikku/http/meta.gen.json":  "./dist/.pikku/http/meta.gen.json",
		"./.pikku/function/a.gen.json": "./fn/a.gen.json", // longest prefix wins
		"./private/x":                  "",
		"./fallback":                   "./nope",
		"./unlisted":                   "",
	} {
		if got, _ := resolveExports(exports, target); got != want {
			t.Errorf("resolveExports(%q) = %q, want %q", target, got, want)
		}
	}
	sugar := mustOJSON(t, `{"require": "./main.js"}`)
	if got, _ := resolveExports(sugar, "."); got != "./main.js" {
		t.Errorf("conditions sugar: %q", got)
	}
	if got, _ := resolveExports(sugar, "./sub"); got != "" {
		t.Errorf("conditions sugar exposes only '.': %q", got)
	}
	if got, _ := resolveExports(mustOJSON(t, `"./only.js"`), "."); got != "./only.js" {
		t.Errorf("string exports: %q", got)
	}
}

func TestResolvePackageSubpath(t *testing.T) {
	root := t.TempDir()
	writeFiles(t, root, map[string]string{
		"node_modules/@s/with-exports/package.json":       `{"exports": {"./.pikku/*": "./dist/.pikku/*"}}`,
		"node_modules/@s/with-exports/dist/.pikku/a.json": `{}`,
		"node_modules/@s/with-exports/.pikku/a.json":      `{}`,
		"node_modules/plain/package.json":                 `{"name": "plain"}`,
		"node_modules/plain/.pikku/b.json":                `{}`,
		"app/src/x.ts":                                    ``,
		"app/node_modules/plain/package.json":             `{"name": "plain"}`,
	})
	real := func(p string) string {
		r, _ := filepath.EvalSymlinks(filepath.Join(root, p))
		return filepath.ToSlash(r)
	}
	app := filepath.Join(root, "app")
	if got := resolvePackageSubpath(app, "@s/with-exports", ".pikku/a.json"); got != real("node_modules/@s/with-exports/dist/.pikku/a.json") {
		t.Errorf("exports-mapped: %q", got)
	}
	if got := resolvePackageSubpath(root, "@s/with-exports", "dist/.pikku/a.json"); got != "" {
		t.Errorf("a subpath outside exports must not resolve: %q", got)
	}
	// The nearest node_modules/plain wins, even though the file is in a
	// farther one: node stops at the first package it finds.
	if got := resolvePackageSubpath(app, "plain", ".pikku/b.json"); got != "" {
		t.Errorf("nearest package shadows: %q", got)
	}
	if got := resolvePackageSubpath(root, "plain", ".pikku/b.json"); got != real("node_modules/plain/.pikku/b.json") {
		t.Errorf("no exports: %q", got)
	}
	if got := resolvePackageSubpath(root, "missing", "x"); got != "" {
		t.Errorf("missing package: %q", got)
	}

	r := addonResolver{filepath.Join(root, "nowhere"), root}
	if p, err := r.resolve("plain/.pikku/b.json"); err != nil || p != real("node_modules/plain/.pikku/b.json") {
		t.Errorf("resolver: %q %v", p, err)
	}
	if _, err := r.resolve("plain/none.json"); !errors.Is(err, errNotResolved) {
		t.Errorf("resolver miss: %v", err)
	}
}

func TestWebhookSecretCredentialName(t *testing.T) {
	for in, want := range map[string]string{
		"github":          "githubWebhookSecret",
		"my-hook_source":  "myHookSourceWebhookSecret",
		"shop--stripe":    "shopStripeWebhookSecret",
		"a_1b":            "a1bWebhookSecret",
		"trailing-":       "trailing-WebhookSecret",
		"Mixed-Case_name": "MixedCaseNameWebhookSecret",
	} {
		if got := webhookSecretCredentialName(in); got != want {
			t.Errorf("webhookSecretCredentialName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNamespaceAddonWebhookSources(t *testing.T) {
	one := namespaceAddonWebhookSources(mustOJSON(t, `{"stripe": {"name": "stripe", "receive": "recv", "check": "other:fn", "events": ["a"]}}`), "shop")
	if got := string(mustRaw(one)); got != `{"shop":{"name":"shop","receive":"shop:recv","check":"other:fn","events":["a"],"route":"/webhooks/shop"}}` {
		t.Errorf("single source: %s", got)
	}
	many := namespaceAddonWebhookSources(mustOJSON(t, `{"a": {"name": "stripe", "setup": "s"}, "b": {"name": "connect", "teardown": ""}, "c": 5}`), "shop")
	if got := string(mustRaw(many)); got != `{"shop-stripe":{"name":"shop-stripe","setup":"shop:s","route":"/webhooks/shop-stripe"},"shop-connect":{"name":"shop-connect","teardown":"","route":"/webhooks/shop-connect"}}` {
		t.Errorf("several sources: %s", got)
	}
}

func mustRaw(v any) []byte {
	type rawer interface{ MarshalJSON() ([]byte, error) }
	b, err := v.(rawer).MarshalJSON()
	if err != nil {
		panic(err)
	}
	return b
}

func TestApplyPackageToHTTPContracts(t *testing.T) {
	c := mustOJSON(t, `{"routes": {"basePath": "/x", "routes": {
		"a": {"method": "get", "route": "/a", "func": {"pikkuFuncId": "a"}},
		"b": {"method": "get", "route": "/b", "func": {"pikkuFuncId": "other:b", "packageName": "@kept"}},
		"group": {"routes": {"c": {"method": "post", "route": "/c", "func": {"pikkuFuncId": "c"}}}},
		"nested": {"d": {"method": "post", "route": "/d", "func": {"pikkuFuncId": "d"}}},
		"skip": "not an object"
	}}}`)
	if err := applyPackageToHTTPContracts(c, "@pkg", "ns"); err != nil {
		t.Fatal(err)
	}
	r := c.get("routes").get("routes")
	check := func(fn *ojson, id, pkg string) {
		t.Helper()
		if got, _ := fn.get("pikkuFuncId").str(); got != id {
			t.Errorf("pikkuFuncId = %q, want %q", got, id)
		}
		if got, _ := fn.get("packageName").str(); got != pkg {
			t.Errorf("packageName = %q, want %q", got, pkg)
		}
	}
	check(r.get("a").get("func"), "ns:a", "@pkg")
	check(r.get("b").get("func"), "other:b", "@kept")
	check(r.get("group").get("routes").get("c").get("func"), "ns:c", "@pkg")
	check(r.get("nested").get("d").get("func"), "ns:d", "@pkg")

	noNs := mustOJSON(t, `{"r": {"routes": {"a": {"method": "get", "route": "/a", "func": {"pikkuFuncId": "a"}}}}}`)
	if err := applyPackageToHTTPContracts(noNs, "@pkg", ""); err != nil {
		t.Fatal(err)
	}
	check(noNs.get("r").get("routes").get("a").get("func"), "a", "@pkg")

	for _, bad := range []string{
		`{"r": null}`,
		`{"r": {"routes": {"a": {"method": "get", "route": "/a", "func": "x"}}}}`,
		`{"r": {"routes": {"a": {"method": "get", "route": "/a", "func": {"pikkuFuncId": 1}}}}}`,
	} {
		if err := applyPackageToHTTPContracts(mustOJSON(t, bad), "@pkg", "ns"); !errors.Is(err, errContractShape) {
			t.Errorf("%s: err = %v, want errContractShape", bad, err)
		}
	}
}

func TestApplyPackageToCLIContracts(t *testing.T) {
	c := mustOJSON(t, `{"tool": {
		"run": {"pikkuFuncId": "run", "subcommands": {"deep": {"pikkuFuncId": "deep"}}},
		"ext": {"pikkuFuncId": "x:ext"},
		"group": {"subcommands": {"leaf": {"pikkuFuncId": "leaf", "packageName": "@kept"}}}
	}}`)
	if err := applyPackageToCLIContracts(c, "@pkg", "ns"); err != nil {
		t.Fatal(err)
	}
	want := `{"tool":{"run":{"pikkuFuncId":"ns:run","subcommands":{"deep":{"pikkuFuncId":"ns:deep","packageName":"@pkg"}},"packageName":"@pkg"},"ext":{"pikkuFuncId":"x:ext","packageName":"@pkg"},"group":{"subcommands":{"leaf":{"pikkuFuncId":"ns:leaf","packageName":"@kept"}}}}}`
	if got := string(c.raw()); got != want {
		t.Errorf("\n got %s\nwant %s", got, want)
	}
	if err := applyPackageToCLIContracts(mustOJSON(t, `{"tool": null}`), "@pkg", "ns"); !errors.Is(err, errContractShape) {
		t.Errorf("null commands: %v", err)
	}
}

func TestApplyPackageToChannelContracts(t *testing.T) {
	c := mustOJSON(t, `{"chat": {"send": {"pikkuFuncId": "send"}, "ext": {"pikkuFuncId": "x:ext", "packageName": "@kept"}}}`)
	if err := applyPackageToChannelContracts(c, "@pkg", "ns"); err != nil {
		t.Fatal(err)
	}
	want := `{"chat":{"send":{"pikkuFuncId":"ns:send","packageName":"@pkg"},"ext":{"pikkuFuncId":"x:ext","packageName":"@kept"}}}`
	if got := string(c.raw()); got != want {
		t.Errorf("\n got %s\nwant %s", got, want)
	}
	for _, bad := range []string{`{"chat": null}`, `{"chat": {"send": "x"}}`, `{"chat": {"send": {}}}`} {
		if err := applyPackageToChannelContracts(mustOJSON(t, bad), "@pkg", "ns"); !errors.Is(err, errContractShape) {
			t.Errorf("%s: err = %v, want errContractShape", bad, err)
		}
	}
}

func TestReadRequiredParentServices(t *testing.T) {
	dir := t.TempDir()
	write := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	cases := []struct {
		content string
		want    []string
		ok      bool
	}{
		{"export const other = 1\nexport const requiredParentServices = [\"a\", \"b\"]\n", []string{"a", "b"}, true},
		{"export const requiredParentServices = [\n  \"a\",\n  \"b\"\n]\n", []string{"a", "b"}, true},
		{"export const requiredParentServices = []\n", []string{}, true},
		// The TS imports the module; Go reads it with a regex, so it only
		// understands the shape codegen writes (JSON at the start of a line).
		{"export const requiredParentServices = ['single']\n", nil, false},
		{"  export const requiredParentServices = [\"indented\"]\n", nil, false},
		{"export const somethingElse = [\"a\"]\n", nil, false},
	}
	for i, c := range cases {
		got, ok := readRequiredParentServices(write("s.js", c.content))
		if ok != c.ok || (c.ok && !reflect.DeepEqual(got, c.want)) {
			t.Errorf("case %d: got %v, %v; want %v, %v", i, got, ok, c.want, c.ok)
		}
	}
	if _, ok := readRequiredParentServices(filepath.Join(dir, "missing.js")); ok {
		t.Error("missing file read as ok")
	}
}

func TestReadAddonNeeds(t *testing.T) {
	root := t.TempDir()
	writeFiles(t, root, map[string]string{
		"node_modules/@s/addon/package.json": `{"pikku": {"uses": ["email", 3, "db"]}}`,
		"node_modules/none/package.json":     `{}`,
		"app/package.json":                   `{}`,
	})
	if got := readAddonNeeds([]string{filepath.Join(root, "app")}, "@s/addon"); !reflect.DeepEqual(got, []string{"email", "db"}) {
		t.Errorf("needs = %v", got)
	}
	if got := readAddonNeeds([]string{root}, "none"); len(got) != 0 {
		t.Errorf("no uses = %v", got)
	}
	if got := readAddonNeeds([]string{root}, "absent"); got != nil {
		t.Errorf("absent = %v", got)
	}
}
