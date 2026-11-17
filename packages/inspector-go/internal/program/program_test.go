package program

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNestedProjectFilterVisitsTheBase(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "inner", "deep"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "inner", "pikku.config.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	deep := root + "/inner/deep/a.ts"
	if !NestedProjectFilter(root, "")(deep) {
		t.Fatal("a file in a nested project is skipped")
	}
	withBase := NestedProjectFilter(root, root+"/inner")
	if withBase(deep) || withBase(root+"/inner/b.ts") {
		t.Fatal("a file in the base package is visited")
	}
}
