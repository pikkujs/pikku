package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// The golden tests pin what `pikku-inspect --stdin` returns for each fixture
// under testdata: the finalized state, the diagnostics and the validation
// pass. They replace the parity harness that compared the binary with the
// TypeScript inspector; the goldens were written when both engines agreed on
// every fixture.
//
//	go test ./cmd/pikku-inspect -run TestGolden -update
//
// rewrites them after an intended change.
var update = flag.Bool("update", false, "rewrite the golden files under testdata")

// goldenFixtures are the testdata projects: every directory with a
// pikku.config.json, one level down or under testdata/finalize.
func goldenFixtures(t *testing.T) []string {
	t.Helper()
	var out []string
	for _, pattern := range []string{"../../testdata/*/pikku.config.json", "../../testdata/finalize/*/pikku.config.json"} {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range matches {
			dir, _ := filepath.Abs(filepath.Dir(m))
			out = append(out, dir)
		}
	}
	sort.Strings(out)
	if len(out) == 0 {
		t.Fatal("no fixtures under testdata")
	}
	return out
}

// goldenRequest is the request `pikku all` sends for the fixture, as far as
// its pikku.config.json says (packages/cli/src/services.ts), with the error
// registry the wrapper adds to openAPI.
func goldenRequest(t *testing.T, root string) protocol.Request {
	t.Helper()
	var config struct {
		SrcDirectories []string `json:"srcDirectories"`
		Tsconfig       string   `json:"tsconfig"`
		Addon          bool     `json:"addon"`
		OpenAPI        *struct {
			AdditionalInfo json.RawMessage `json:"additionalInfo"`
		} `json:"openAPI"`
	}
	b, err := os.ReadFile(filepath.Join(root, "pikku.config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &config); err != nil {
		t.Fatal(err)
	}
	tsconfig := filepath.Join(root, config.Tsconfig)
	opts := protocol.Options{
		RootDir:      root,
		Tsconfig:     tsconfig,
		IsAddon:      config.Addon,
		Types:        json.RawMessage(`{}`),
		SchemaConfig: &protocol.SchemaConfig{Tsconfig: tsconfig, VendorScript: findVendorScript(root)},
		Allow:        &protocol.Allow{},
		ModelAliases: map[string]string{},
	}
	if config.OpenAPI != nil {
		errs, err := os.ReadFile("../../testdata/openapi-errors.json")
		if err != nil {
			t.Fatal(err)
		}
		opts.OpenAPI, _ = json.Marshal(map[string]json.RawMessage{
			"additionalInfo": config.OpenAPI.AdditionalInfo,
			"errors":         errs,
		})
	}
	if m, err := os.ReadFile(filepath.Join(root, "versions.pikku.json")); err == nil {
		opts.Manifest = m
	}
	return protocol.Request{RouteFiles: findSourceFiles(filepath.ToSlash(root), config.SrcDirectories), Options: opts}
}

// golden is the part of a Response a golden file holds: everything but the
// stats, with this machine's paths replaced so the file is portable.
func golden(t *testing.T, root string, res *protocol.Response) []byte {
	t.Helper()
	out := struct {
		Error          string            `json:"error,omitempty"`
		State          *state.State      `json:"state,omitempty"`
		Diagnostics    []diag.Diagnostic `json:"diagnostics"`
		ValidationPass *diag.Pass        `json:"validationPass,omitempty"`
	}{res.Error, res.State, res.Diagnostics, res.ValidationPass}
	b, err := jsjson.Marshal(out, "  ")
	if err != nil {
		t.Fatal(err)
	}
	repo, _ := filepath.Abs("../../../..")
	s := strings.ReplaceAll(string(b), filepath.ToSlash(root), "<fixture>")
	s = strings.ReplaceAll(s, filepath.ToSlash(repo), "<repo>")
	// Unique type names hash the type's absolute path, as the TS engine's do,
	// so they change with the checkout location.
	s = uniqueTypeHash.ReplaceAllString(s, "${1}_<pathhash>")
	return []byte(s + "\n")
}

var uniqueTypeHash = regexp.MustCompile(`\b([A-Za-z_]\w*?)_[0-9a-f]{12}\b`)

func TestGolden(t *testing.T) {
	testdata, _ := filepath.Abs("../../testdata")
	for _, root := range goldenFixtures(t) {
		rel, _ := filepath.Rel(testdata, root)
		t.Run(filepath.ToSlash(rel), func(t *testing.T) {
			res, err := inspect(goldenRequest(t, root), nil)
			if err != nil {
				t.Fatal(err)
			}
			got := golden(t, root, res)
			file := filepath.Join(root, "inspect.golden.json")
			if *update {
				if err := os.WriteFile(file, got, 0o644); err != nil {
					t.Fatal(err)
				}
				return
			}
			want, err := os.ReadFile(file)
			if err != nil {
				t.Fatalf("%v (run with -update to create it)", err)
			}
			if !bytes.Equal(got, want) {
				t.Errorf("differs from %s; run with -update if the change is intended\n%s", file, firstDiff(want, got))
			}
		})
	}
}

// firstDiff shows the first line where two golden files differ.
func firstDiff(want, got []byte) string {
	w := strings.Split(string(want), "\n")
	g := strings.Split(string(got), "\n")
	for i := 0; i < len(w) || i < len(g); i++ {
		var a, b string
		if i < len(w) {
			a = w[i]
		}
		if i < len(g) {
			b = g[i]
		}
		if a != b {
			return "line " + strconv.Itoa(i+1) + ":\n- " + a + "\n+ " + b
		}
	}
	return ""
}
