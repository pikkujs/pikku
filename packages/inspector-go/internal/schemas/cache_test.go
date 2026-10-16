package schemas

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestSchemaCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()
	dep := filepath.Join(dir, "types.ts")
	if err := os.WriteFile(dep, []byte("export type A = { a: string }"), 0o644); err != nil {
		t.Fatal(err)
	}
	log := &diag.Logger{}
	cfg := Config{CacheDir: filepath.Join(dir, "cache")}
	key := schemaCacheKey(cfg, "content", []string{"A"})
	if key == schemaCacheKey(cfg, "content", []string{"B"}) || key == schemaCacheKey(cfg, "other", []string{"A"}) {
		t.Fatal("key ignores its inputs")
	}

	var schemas state.Record[state.Raw]
	schemas.Set("B", state.Raw(`{"type":"string","description":"<b> & </b>"}`))
	schemas.Set("A", state.Raw(`{"type":"object"}`))
	writeSchemaCache(log, cfg.CacheDir, key, schemas, schemaDeps([]string{dep, "bundled:///libs/lib.d.ts"}))

	got, ok := readSchemaCache(log, cfg.CacheDir, key)
	if !ok {
		t.Fatal("cache miss after write")
	}
	if keys := got.Keys(); len(keys) != 2 || keys[0] != "B" {
		t.Errorf("keys = %v, want the written order", keys)
	}
	if string(got.At("B")) != `{"type":"string","description":"<b> & </b>"}` {
		t.Errorf("B = %s", got.At("B"))
	}
	if _, ok := readSchemaCache(log, cfg.CacheDir, "other-key"); ok {
		t.Error("hit with a different key")
	}

	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(dep, later, later); err != nil {
		t.Fatal(err)
	}
	if _, ok := readSchemaCache(log, cfg.CacheDir, key); ok {
		t.Error("hit after a dependency changed")
	}
}
