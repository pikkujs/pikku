package sourcescan

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type copyCorpusEntry struct {
	S string `json:"s"`
	L bool   `json:"l"`
	E bool   `json:"e"`
	A bool   `json:"a"`
}

func checkCopyCorpus(t *testing.T, file string) int {
	t.Helper()
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var corpus []copyCorpusEntry
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	failures := 0
	for _, c := range corpus {
		if got := looksLikeCopy(c.S, []string{"·", "—", "…"}); got != c.L {
			failures++
			t.Errorf("looksLikeCopy(%q) = %v, want %v", c.S, got, c.L)
		}
		if got := looksLikeCopy(c.S, []string{"Save", "·"}); got != c.A {
			failures++
			t.Errorf("looksLikeCopy(%q, allowed) = %v, want %v", c.S, got, c.A)
		}
		if got := readsAsEnglish(c.S); got != c.E {
			failures++
			t.Errorf("readsAsEnglish(%q) = %v, want %v", c.S, got, c.E)
		}
		if failures > 50 {
			t.Fatal("too many failures")
		}
	}
	return len(corpus)
}

// testdata/source-checks/copy-corpus.json holds strings with the answers the
// TypeScript looksLikeCopy and readsAsEnglish gave. COPY_CORPUS names a larger
// file of the same shape.
func TestCopyTextMatchesTypeScriptReference(t *testing.T) {
	file, err := filepath.Abs("../../testdata/source-checks/copy-corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	if checkCopyCorpus(t, file) == 0 {
		t.Fatal("empty corpus")
	}
	if large := os.Getenv("COPY_CORPUS"); large != "" {
		checkCopyCorpus(t, large)
	}
}
