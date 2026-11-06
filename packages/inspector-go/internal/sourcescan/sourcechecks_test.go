package sourcescan

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type sourceChecksCase struct {
	Fn     string          `json:"fn"`
	Dir    string          `json:"dir"`
	Params json.RawMessage `json:"params"`
	Result any             `json:"result"`
}

type sourceChecksParams struct {
	Allowed     []string `json:"allowed"`
	Props       []string `json:"props"`
	Helpers     []string `json:"helpers"`
	Gated       bool     `json:"gated"`
	CopyHelpers []string `json:"copyHelpers"`
}

func runSourceCheck(t *testing.T, c sourceChecksCase, dir string) any {
	t.Helper()
	var p sourceChecksParams
	if err := json.Unmarshal(c.Params, &p); err != nil {
		t.Fatal(err)
	}
	switch c.Fn {
	case "asI18nArguments":
		return FindAsI18nArguments(dir)
	case "asI18nStubs":
		return FindAsI18nStubs(dir)
	case "sepArguments":
		return FindSepArguments(dir)
	case "jsxLiteralText":
		return FindJsxLiteralText(dir, p.Allowed, p.Gated)
	case "jsxLiteralProps":
		return FindJsxLiteralProps(dir, p.Allowed, p.Props, p.Helpers, p.Gated)
	case "stringLiteralCopy":
		return FindStringLiteralCopy(dir, p.CopyHelpers)
	}
	t.Fatalf("unknown function %s", c.Fn)
	return nil
}

// roundTrip puts a result through JSON, the way the TypeScript caller sees it.
func roundTrip(t *testing.T, v any, root string) any {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err := json.Unmarshal([]byte(strings.ReplaceAll(string(raw), strings.ReplaceAll(root, `\`, `\\`)+string(filepath.Separator), "")), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// testdata/source-checks/expected.json was produced by the TypeScript 6
// implementation of the six checks over the same directory.
func TestSourceChecksMatchTypeScriptReference(t *testing.T) {
	root, err := filepath.Abs("../../testdata/source-checks")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(root, "expected.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []sourceChecksCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range cases {
		dir := root
		if c.Dir != "." {
			dir = filepath.Join(root, c.Dir)
		}
		got := roundTrip(t, runSourceCheck(t, c, dir), root)
		if !reflect.DeepEqual(got, c.Result) {
			g, _ := json.MarshalIndent(got, "", " ")
			w, _ := json.MarshalIndent(c.Result, "", " ")
			t.Errorf("%s %s %s:\ngot:\n%.3000s\nwant:\n%.3000s", c.Fn, c.Dir, c.Params, g, w)
		}
	}
}

func TestSourceChecksFindHits(t *testing.T) {
	root, _ := filepath.Abs("../../testdata/source-checks")
	if got := len(FindAsI18nArguments(root)); got == 0 {
		t.Error("asI18nArguments found nothing")
	}
	if got := len(FindSepArguments(root)); got == 0 {
		t.Error("sepArguments found nothing")
	}
}
