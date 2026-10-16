package visit

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func TestLeafSpecifierOf(t *testing.T) {
	for spec, want := range map[string]string{
		"#pikku/workflow": "#pikku/workflow",
		"#pikku/workflow/pikku-workflow-types.gen.js": "#pikku/workflow",
		"#pikku/pikku-bootstrap.gen.js":               "",
		"#pikku/":                                     "",
		"@pikku/core":                                 "",
	} {
		got, ok := leafSpecifierOf(spec)
		if got != want || ok != (want != "") {
			t.Errorf("leafSpecifierOf(%q) = %q, %v; want %q", spec, got, ok, want)
		}
	}
}

func TestSurfaceUsageArea(t *testing.T) {
	root := t.TempDir()
	write := func(rel, body string) {
		p := filepath.Join(root, rel)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("package.json", `{"name":"root-pkg"}`)
	write("packages/a/package.json", `{"name":"@x/a"}`)
	write("packages/b/package.json", `{"name":""}`)
	write("packages/c/package.json", `{not json`)
	cache := map[string]*string{}
	for file, want := range map[string]string{
		"packages/a/src/deep/f.ts": "@x/a",
		"packages/b/src/f.ts":      "packages",
		"packages/c/f.ts":          "packages",
		"src/f.ts":                 "src",
		"top.ts":                   filepath.Base(root),
	} {
		if got := surfaceUsageArea(filepath.Join(root, file), root, cache); got != want {
			t.Errorf("surfaceUsageArea(%s) = %q, want %q", file, got, want)
		}
	}
}

func TestJSSortOrder(t *testing.T) {
	// U+FF5E sorts after U+1F600 by code point, before it by UTF-16 unit.
	in := map[string]bool{"\U0001F600": true, "～": true, "B": true, "a": true, "10:x": true, "9:x": true}
	got := jsSortedKeys(in)
	want := []string{"10:x", "9:x", "B", "a", "\U0001F600", "～"}
	if !sort.SliceIsSorted(want, func(i, j int) bool { return compareUTF16(want[i], want[j]) < 0 }) {
		t.Fatal("want is not UTF-16 ordered")
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %q, want %q", got, want)
		}
	}
}
