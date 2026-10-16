package schemas

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// TestSchemaParity compares GenerateAll with the TS generateAllSchemas on real
// projects. Each reference is written by bench/ref-schemas.mjs:
//
//	node bench/ref-schemas.mjs ../../examples/online-shop /tmp/ref-online-shop.json
//	PIKKU_SCHEMA_PARITY_REF=/tmp/ref-online-shop.json go test ./internal/schemas -run Parity -v
//
// PIKKU_SCHEMA_PARITY_REF takes a comma-separated list. Set
// PIKKU_SCHEMA_PARITY_OUT to a directory to get the Go schemas and a diff
// report written there. The test fails only when the key sets differ or a
// schema differs beyond member order in a union; byte and strict semantic
// equality are reported, not asserted.
func TestSchemaParity(t *testing.T) {
	refs := os.Getenv("PIKKU_SCHEMA_PARITY_REF")
	if refs == "" {
		t.Skip("PIKKU_SCHEMA_PARITY_REF not set")
	}
	for _, ref := range strings.Split(refs, ",") {
		t.Run(filepath.Base(ref), func(t *testing.T) { checkParity(t, ref) })
	}
}

type parityRef struct {
	Config struct {
		Tsconfig         string   `json:"tsconfig"`
		SchemasFromTypes []string `json:"schemasFromTypes"`
		Schema           struct {
			AdditionalProperties *bool `json:"additionalProperties"`
		} `json:"schema"`
	} `json:"config"`
	PreState    json.RawMessage            `json:"preState"`
	Schemas     map[string]json.RawMessage `json:"schemas"`
	CustomTypes string                     `json:"customTypes"`
	Ms          float64                    `json:"ms"`
	Errors      []string                   `json:"errors"`
	Timings     []string                   `json:"timings"`
}

func checkParity(t *testing.T, refPath string) {
	raw, err := os.ReadFile(refPath)
	if err != nil {
		t.Fatal(err)
	}
	var ref parityRef
	if err := json.Unmarshal(raw, &ref); err != nil {
		t.Fatal(err)
	}
	script, _ := filepath.Abs("../../scripts/vendor-schemas.mjs")
	cache := program.NewCache()

	var got state.Record[state.Raw]
	var st *state.State
	var log *diag.Logger
	var durations []time.Duration
	for range 3 {
		st = &state.State{}
		if err := json.Unmarshal(ref.PreState, st); err != nil {
			t.Fatal(err)
		}
		cfg := Config{
			Tsconfig:             ref.Config.Tsconfig,
			SchemasFromTypes:     ref.Config.SchemasFromTypes,
			AdditionalProperties: ref.Config.Schema.AdditionalProperties,
			Vendor:               NodeConverter{Script: script, Dir: st.RootDir},
		}
		var debug bytes.Buffer
		log = &diag.Logger{DebugOut: &debug}
		cache.Begin()
		start := time.Now()
		got, err = GenerateAll(log, cfg, st, cache)
		durations = append(durations, time.Since(start))
		cache.Prune()
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("run %d: %v\n%s", len(durations), durations[len(durations)-1].Round(time.Millisecond), indent(debug.String()))
	}
	t.Logf("TS generateAllSchemas: %.0fms %v; Go: %v", ref.Ms, ref.Timings, durations)

	for _, d := range log.Entries() {
		t.Logf("diagnostic: %s %s %s", d.Level, d.Code, d.Message)
	}
	t.Logf("TS errors: %v", ref.Errors)

	if content, _ := GenerateCustomTypes(st.Functions.TypesMap); content != ref.CustomTypes {
		t.Errorf("custom types source differs from TS")
		writeOut(t, "customTypes.go.ts", []byte(content))
		writeOut(t, "customTypes.ts.ts", []byte(ref.CustomTypes))
	}

	var missing, extra []string
	for k := range ref.Schemas {
		if !got.Has(k) {
			missing = append(missing, k)
		}
	}
	for _, k := range got.Keys() {
		if _, ok := ref.Schemas[k]; !ok {
			extra = append(extra, k)
		}
	}
	sort.Strings(missing)
	t.Logf("keys: TS %d, Go %d, missing in Go %v, extra in Go %v", len(ref.Schemas), got.Len(), missing, extra)
	if len(missing)+len(extra) > 0 {
		t.Errorf("key sets differ")
	}

	var byteEq, semEq, unionEq int
	var report strings.Builder
	for _, k := range got.Keys() {
		want, ok := ref.Schemas[k]
		if !ok {
			continue
		}
		g := got.At(k)
		if bytes.Equal(g, want) {
			byteEq++
			semEq++
			unionEq++
			continue
		}
		gv, wv := decode(t, g), decode(t, want)
		switch {
		case reflect.DeepEqual(gv, wv):
			semEq++
			unionEq++
		case reflect.DeepEqual(canonicalUnions(gv), canonicalUnions(wv)):
			unionEq++
			fmt.Fprintf(&report, "== %s (union order only)\n go: %s\n ts: %s\n", k, g, want)
		default:
			t.Errorf("schema %s differs", k)
			fmt.Fprintf(&report, "!! %s\n go: %s\n ts: %s\n", k, g, want)
		}
	}
	common := got.Len() - len(extra)
	t.Logf("of %d common schemas: byte-equal %d, semantically equal %d, equal up to union order %d", common, byteEq, semEq, unionEq)

	var all bytes.Buffer
	all.WriteByte('{')
	for i, k := range got.Keys() {
		if i > 0 {
			all.WriteByte(',')
		}
		kb, _ := json.Marshal(k)
		all.Write(kb)
		all.WriteByte(':')
		all.Write(got.At(k))
	}
	all.WriteByte('}')
	writeOut(t, "schemas.go.json", all.Bytes())
	writeOut(t, "report.txt", []byte(report.String()))
}

func decode(t *testing.T, b []byte) any {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

// unorderedKeys hold arrays whose member order carries no meaning.
var unorderedKeys = map[string]bool{"anyOf": true, "oneOf": true, "allOf": true, "enum": true, "type": true, "required": true}

// canonicalUnions sorts the members of order-insensitive arrays by their
// encoding, so two schemas that differ only in union order compare equal.
func canonicalUnions(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, e := range x {
			c := canonicalUnions(e)
			if arr, ok := c.([]any); ok && unorderedKeys[k] {
				sort.Slice(arr, func(i, j int) bool {
					a, _ := json.Marshal(arr[i])
					b, _ := json.Marshal(arr[j])
					return string(a) < string(b)
				})
			}
			out[k] = c
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = canonicalUnions(e)
		}
		return out
	}
	return v
}

func writeOut(t *testing.T, name string, b []byte) {
	dir := os.Getenv("PIKKU_SCHEMA_PARITY_OUT")
	if dir == "" {
		return
	}
	dir = filepath.Join(dir, strings.TrimSuffix(filepath.Base(t.Name()), ".json"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func indent(s string) string {
	return "    " + strings.ReplaceAll(strings.TrimRight(s, "\n"), "\n", "\n    ")
}
