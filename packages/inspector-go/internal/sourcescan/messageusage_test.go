package sourcescan

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// testdata/message-usage/expected.json was produced by the TypeScript 6
// implementation of scanMessageUsage over the same directory.
func TestScanMessageUsageMatchesTypeScriptReference(t *testing.T) {
	root, err := filepath.Abs("../../testdata/message-usage")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(root, "expected.json"))
	if err != nil {
		t.Fatal(err)
	}
	var want MessageUsage
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	got := ScanMessageUsage(root)
	rel := func(f string) string { return strings.TrimPrefix(f, root+string(filepath.Separator)) }
	for i := range got.UsedIn {
		for j := range got.UsedIn[i].Files {
			got.UsedIn[i].Files[j] = rel(got.UsedIn[i].Files[j])
		}
	}
	for i := range got.Computed {
		got.Computed[i].File = rel(got.Computed[i].File)
	}
	for i := range got.Unparsed {
		got.Unparsed[i] = rel(got.Unparsed[i])
	}
	if !reflect.DeepEqual(got, want) {
		g, _ := json.MarshalIndent(got, "", "  ")
		w, _ := json.MarshalIndent(want, "", "  ")
		t.Fatalf("got:\n%s\nwant:\n%s", g, w)
	}
}

func TestSourceFilesSkipsGeneratedHiddenAndVendorDirectories(t *testing.T) {
	root, _ := filepath.Abs("../../testdata/message-usage")
	for _, f := range SourceFiles(root, false, true) {
		for _, bad := range []string{".hidden", ".gen.", "paraglide", ".d.ts"} {
			if strings.Contains(strings.TrimPrefix(f, root), bad) {
				t.Errorf("%s should have been skipped (%s)", f, bad)
			}
		}
	}
}
