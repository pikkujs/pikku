package analyze

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

func classificationDiagnostics(t *testing.T, opts protocol.Options, dir string) []diag.Diagnostic {
	t.Helper()
	root, _ := filepath.Abs(dir)
	var files []string
	_ = filepath.Walk(filepath.Join(root, "src"), func(p string, info os.FileInfo, err error) error {
		if err == nil && strings.HasSuffix(p, ".ts") {
			files = append(files, p)
		}
		return nil
	})
	opts.RootDir, opts.Tsconfig = root, filepath.Join(root, "tsconfig.json")
	res, err := Run(protocol.Request{RouteFiles: files, Options: opts}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return res.Diagnostics
}

type classificationEntry struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// diagnostics.golden.json is the TypeScript inspector's output for the fixture,
// written by parity/classification-golden.ts, so this is a parity check on the
// messages byte for byte and not a snapshot of what Go happens to print.
func TestClassificationScan(t *testing.T) {
	got := []classificationEntry{}
	for _, d := range classificationDiagnostics(t, protocol.Options{ClassificationCheck: true}, "../../testdata/classification") {
		if d.Code == diag.SecretRevealedIntoSink || d.Code == diag.PiiIntoSink || d.Code == diag.PiiInOutput {
			got = append(got, classificationEntry{string(d.Code), d.Message})
		}
	}
	raw, err := os.ReadFile("../../testdata/classification/diagnostics.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var want []classificationEntry
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got, want) {
		for i := 0; i < max(len(got), len(want)); i++ {
			var g, w classificationEntry
			if i < len(got) {
				g = got[i]
			}
			if i < len(want) {
				w = want[i]
			}
			if g != w {
				t.Errorf("diagnostic %d:\n  go: %s %q\n  ts: %s %q", i, g.Code, g.Message, w.Code, w.Message)
			}
		}
	}
}

// Off by default: it is a `pikku all --security` lint, not codegen.
func TestClassificationScanIsOptIn(t *testing.T) {
	for _, d := range classificationDiagnostics(t, protocol.Options{}, "../../testdata/classification") {
		if d.Code == diag.SecretRevealedIntoSink || d.Code == diag.PiiIntoSink || d.Code == diag.PiiInOutput {
			t.Fatalf("unexpected diagnostic without classificationCheck: %s", d.Message)
		}
	}
}

func TestPermissionsInBodyNeedsOptIn(t *testing.T) {
	const dir = "../../testdata/permissions-in-body"
	raw, err := os.ReadFile(dir + "/diagnostics.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var want []classificationEntry
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if len(want) != 1 {
		t.Fatalf("golden holds %d entries, want 1", len(want))
	}
	refused := false
	for _, d := range classificationDiagnostics(t, protocol.Options{}, dir) {
		if d.Code == diag.PermissionsInBodyNotAllowed {
			refused = true
			if d.Message != want[0].Message {
				t.Errorf("message differs:\n  go: %q\n  ts: %q", d.Message, want[0].Message)
			}
		}
	}
	if !refused {
		t.Error("permissionsInBody without allow.permissionsInBody was not refused")
	}
	for _, d := range classificationDiagnostics(t, protocol.Options{Allow: &protocol.Allow{PermissionsInBody: true}}, dir) {
		if d.Code == diag.PermissionsInBodyNotAllowed {
			t.Errorf("refused despite the opt-in: %s", d.Message)
		}
	}
}
