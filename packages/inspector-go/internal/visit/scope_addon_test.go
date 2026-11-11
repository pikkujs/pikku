package visit

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestLoadAddonScopes(t *testing.T) {
	dir := t.TempDir()
	pkgDir := filepath.Join(dir, "node_modules", "@acme", "addon")
	meta := filepath.Join(pkgDir, ".pikku", "scopes")
	if err := os.MkdirAll(meta, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(pkgDir, "package.json"), []byte(`{"name":"@acme/addon"}`), 0o644)
	_ = os.WriteFile(filepath.Join(meta, "pikku-scopes-meta.gen.json"), []byte(`{
		"acme": {"name":"acme","origin":{"kind":"addon","package":"@acme/raw","displayName":"Acme"},"scopes":{"read":{}}},
		"plain": {"name":"plain","origin":{"kind":"app"}},
		"taken": {"name":"taken"}
	}`), 0o644)

	s := &Context{State: &state.State{}}
	s.State.Scopes.Definitions = state.List[state.Raw]{state.Raw(`{"name":"taken"}`)}
	s.loadAddonScopes(&addonDecl{pkg: "@acme/addon"}, dir)

	got := s.State.Scopes.Definitions
	want := []string{
		`{"name":"taken"}`,
		`{"name":"acme","origin":{"kind":"addon","package":"@acme/addon","displayName":"Acme"},"scopes":{"read":{}}}`,
		`{"name":"plain","origin":{"kind":"addon","package":"@acme/addon"}}`,
	}
	if len(got) != len(want) {
		t.Fatalf("got %d definitions: %s", len(got), got)
	}
	for i := range want {
		if string(got[i]) != want[i] {
			t.Errorf("definition %d:\n got %s\nwant %s", i, got[i], want[i])
		}
	}
}
