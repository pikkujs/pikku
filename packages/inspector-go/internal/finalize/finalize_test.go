package finalize

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestToKebab(t *testing.T) {
	for in, want := range map[string]string{
		"checkoutWorkflow":    "checkout-workflow",
		"refundOrderWorkflow": "refund-order-workflow",
		"HTTPServerStep":      "http-server-step",
		"step2Done":           "step2-done",
		"plain":               "plain",
	} {
		if got := toKebab(in); got != want {
			t.Errorf("toKebab(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestProseOpensWithVirtualUser(t *testing.T) {
	cases := []struct {
		prose, user string
		want        bool
	}{
		{"Alice opens the cart", "Alice", true},
		{"alice opens the cart", "Alice", true},
		{"  “Alice’s cart is empty", "Alice", true},
		{" Alice's cart", "Alice", true},
		{"Alicey opens the cart", "Alice", false},
		{"Then Alice opens the cart", "Alice", false},
		{"A.B. pays", "A.B.", false}, // \b after a non-word char needs a word char next
		{"Alice opens", "", false},
	}
	for _, c := range cases {
		if got := proseOpensWithVirtualUser(c.prose, c.user); got != c.want {
			t.Errorf("proseOpensWithVirtualUser(%q, %q) = %v, want %v", c.prose, c.user, got, c.want)
		}
	}
}

func TestTemplateValue(t *testing.T) {
	for in, want := range map[string]string{
		``:                  "undefined",
		`"x"`:               "x",
		`{"a":1}`:           "[object Object]",
		`["a",null,1,true]`: "a,,1,true",
		`null`:              "null",
		`12`:                "12",
		`false`:             "false",
	} {
		if got := templateValue(json.RawMessage(in)); got != want {
			t.Errorf("templateValue(%s) = %q, want %q", in, got, want)
		}
	}
}

func TestApplyDeclaredScopesAndFlatten(t *testing.T) {
	st := &state.State{}
	st.Scopes.Definitions = state.List[state.Raw]{state.Raw(`{"name":"orders","scopes":{"read":{}}}`)}
	declared := state.NewMap[string]()
	declared.Set("orders:write", "a.ts")
	declared.Set("billing:invoices:read", "b.ts")
	declared.Set("orders:read", "c.ts")
	st.Scopes.Declared = declared

	applyDeclaredScopes(st)

	if len(st.Scopes.Definitions) != 2 {
		t.Fatalf("want 2 root definitions, got %d", len(st.Scopes.Definitions))
	}
	var billing map[string]any
	if err := json.Unmarshal(st.Scopes.Definitions[1], &billing); err != nil {
		t.Fatal(err)
	}
	if billing["name"] != "billing" || billing["sourceFile"] != "b.ts" {
		t.Errorf("billing root = %v", billing)
	}
	got := flattenScopeIds(st.Scopes.Definitions).items
	want := []string{"orders", "orders:read", "orders:write", "billing", "billing:invoices", "billing:invoices:read"}
	if !slices.Equal(got, want) {
		t.Errorf("flattenScopeIds = %v, want %v", got, want)
	}
}

func TestIsPackageResolvable(t *testing.T) {
	root := t.TempDir()
	write := func(rel, body string) {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("node_modules/@scope/dep/package.json", `{"name":"@scope/dep"}`)
	write("node_modules/plain.js", ``)
	write("app/package.json", `{"name":"@me/app","exports":{".":"./index.js"}}`)
	write("lib/package.json", `{"name":"@me/lib"}`)
	app := filepath.Join(root, "app")
	lib := filepath.Join(root, "lib")

	for _, c := range []struct {
		pkg  string
		dirs []string
		want bool
	}{
		{"@scope/dep", []string{app}, true}, // found walking up from app
		{"plain", []string{app}, true},
		{"@me/app", []string{app}, true},  // self-reference through exports
		{"@me/lib", []string{lib}, false}, // no exports, no self-reference
		{"missing", []string{app, lib}, false},
	} {
		if got := isPackageResolvable(c.pkg, c.dirs); got != c.want {
			t.Errorf("isPackageResolvable(%q) = %v, want %v", c.pkg, got, c.want)
		}
	}
}

func TestValidationPassBracket(t *testing.T) {
	log := &diag.Logger{}
	if log.ValidationPass() != nil {
		t.Fatal("no pass yet")
	}
	log.Warn("before")
	log.BeginValidationPass()
	log.Warn("inside")
	log.Warn("inside too")
	log.EndValidationPass()
	log.Warn("after")
	if p := log.ValidationPass(); p == nil || *p != (diag.Pass{Start: 1, End: 3}) {
		t.Errorf("pass = %+v, want {1 3}", p)
	}

	open := &diag.Logger{}
	open.Seed([]diag.Diagnostic{{Level: diag.Info, Message: "analysis"}})
	open.BeginValidationPass()
	open.Warn("x")
	if p := open.ValidationPass(); p == nil || *p != (diag.Pass{Start: 1, End: 2}) {
		t.Errorf("unended pass = %+v, want {1 2}", p)
	}
}
