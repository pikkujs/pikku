package typesmap

import (
	"encoding/json"
	"os"
	"testing"
)

// The TypeScript inspector's own cases, so the two ports cannot drift.
func TestCanonicalTypeString(t *testing.T) {
	b, err := os.ReadFile("../../../inspector/src/utils/canonical-type-string.cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		In  string `json:"in"`
		Out string `json:"out"`
	}
	if err := json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if got := CanonicalTypeString(c.In); got != c.Out {
			t.Errorf("CanonicalTypeString(%q)\n got %q\nwant %q", c.In, got, c.Out)
		}
		if got := CanonicalTypeString(c.Out); got != c.Out {
			t.Errorf("not idempotent on %q: %q", c.Out, got)
		}
	}
}
