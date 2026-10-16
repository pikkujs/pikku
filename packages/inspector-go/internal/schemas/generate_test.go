package schemas

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func writeProject(t *testing.T, files map[string]string) string {
	dir := t.TempDir()
	for name, text := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestGenerateAll(t *testing.T) {
	dir := writeProject(t, map[string]string{
		"tsconfig.json": `{"compilerOptions":{"strict":true,"module":"nodenext","target":"esnext"}}`,
		"types.ts": `export interface User {
  id: string
  /** Shown to others. */
  name?: string
  tags: Array<'a' | 'b'>
}
`,
	})
	st := state.New(dir)
	tm := st.Functions.TypesMap
	tm.AddType("User", filepath.Join(dir, "types.ts"))
	tm.AddCustomType("GetUserOutput", "{ user: User; when: Date }", []string{"User"})
	// Declared in the virtual file as my_flag, so the lookup by its own name
	// fails and the primitive fallback answers.
	tm.AddCustomType("my-flag", "boolean", nil)
	st.Functions.Meta.Set("getUser", &state.FunctionMeta{Inputs: []string{"User"}, Outputs: []string{"GetUserOutput"}})

	log := &diag.Logger{}
	got, err := GenerateAll(log, Config{Tsconfig: filepath.Join(dir, "tsconfig.json"), SchemasFromTypes: []string{"NoSuchType"}}, st, program.NewCache())
	if err != nil {
		t.Fatal(err)
	}
	if keys := strings.Join(got.Keys(), ","); keys != "GetUserOutput,my-flag,User" {
		t.Errorf("keys %s", keys)
	}
	for name, want := range map[string]string{
		"User":          `{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"id":{"type":"string"},"name":{"type":"string","description":"Shown to others."},"tags":{"type":"array","items":{"type":"string","enum":["a","b"]}}},"required":["id","tags"],"additionalProperties":false,"definitions":{}}`,
		"my-flag":       `{"type":"boolean"}`,
		"GetUserOutput": `{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"user":{"$ref":"#/definitions/User"},"when":{"type":"string","format":"date-time"}},"required":["user","when"],"additionalProperties":false,"definitions":{"User":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string","description":"Shown to others."},"tags":{"type":"array","items":{"type":"string","enum":["a","b"]}}},"required":["id","tags"],"additionalProperties":false}}}`,
	} {
		if s := string(got.At(name)); s != want {
			t.Errorf("%s:\n got %s\nwant %s", name, s, want)
		}
	}
	if e := log.Entries(); len(e) != 0 {
		t.Errorf("unexpected diagnostics %v", e)
	}
}

type fakeConverter struct {
	res  VendorResult
	refs []VendorRef
}

func (f *fakeConverter) Convert(_ context.Context, refs []VendorRef) (VendorResult, error) {
	f.refs = refs
	return f.res, nil
}

func TestGenerateAllVendorSchemas(t *testing.T) {
	dir := writeProject(t, map[string]string{"tsconfig.json": `{}`})
	st := state.New(dir)
	st.SchemaLookup.Set("CreateInput", state.SchemaRef{VariableName: "Create", SourceFile: dir + "/f.ts", Vendor: "zod"})
	st.Functions.Meta.Set("create", &state.FunctionMeta{Inputs: []string{"CreateInput"}, Outputs: []string{"CreateOutput"}})
	// The output type refers to the Zod-derived type, which only exists once
	// the conversion has added it to the typesMap.
	st.Functions.TypesMap.AddCustomType("CreateOutput", "{ input: CreateInput }", nil)
	conv := &fakeConverter{res: VendorResult{Schemas: []VendorSchema{{
		Name: "CreateInput", Schema: state.Raw(`{"type":"object","properties":{"a":{"type":"string"}},"required":["a"]}`), TypeText: "{ a: string }",
	}}}}

	log := &diag.Logger{}
	got, err := GenerateAll(log, Config{Tsconfig: filepath.Join(dir, "tsconfig.json"), Vendor: conv}, st, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(conv.refs) != 1 || conv.refs[0].Name != "CreateInput" || conv.refs[0].VariableName != "Create" {
		t.Errorf("converter got %+v", conv.refs)
	}
	if keys := strings.Join(got.Keys(), ","); keys != "CreateOutput,CreateInput" {
		t.Errorf("keys %s", keys)
	}
	if s := string(got.At("CreateInput")); s != `{"type":"object","properties":{"a":{"type":"string"}},"required":["a"]}` {
		t.Errorf("vendor schema not kept verbatim: %s", s)
	}
	if s := string(got.At("CreateOutput")); !strings.Contains(s, `"definitions":{"CreateInput":{"type":"object","properties":{"a":{"type":"string"}}`) {
		t.Errorf("CreateOutput did not resolve the Zod-derived type: %s", s)
	}
	if ct, ok := st.Functions.TypesMap.CustomType("CreateInput"); !ok || ct.Type != "{ a: string }" {
		t.Errorf("Zod type not added to the typesMap: %+v", ct)
	}
}

func TestGenerateAllVendorFailures(t *testing.T) {
	newState := func(vendor string) *state.State {
		st := state.New("/root")
		st.SchemaLookup.Set("In", state.SchemaRef{VariableName: "In", SourceFile: "/root/f.ts", Vendor: vendor})
		return st
	}
	cfg := Config{Tsconfig: "/root/tsconfig.json"}

	if _, err := GenerateAll(&diag.Logger{}, cfg, newState("zod"), nil); err == nil || !strings.Contains(err.Error(), "no vendor schema converter") {
		t.Errorf("missing converter: %v", err)
	}

	cfg.Vendor = &fakeConverter{}
	if _, err := GenerateAll(&diag.Logger{}, cfg, newState("valibot"), nil); err == nil ||
		err.Error() != "Schema 'In' uses valibot which is not yet supported for JSON Schema generation. Currently only Zod schemas can be converted to JSON Schema. Please use Zod or contribute support for valibot." {
		t.Errorf("unsupported vendor: %v", err)
	}

	cfg.Vendor = &fakeConverter{res: VendorResult{Errors: []string{"Could not convert Zod schema 'In': boom"}}}
	log := &diag.Logger{}
	if _, err := GenerateAll(log, cfg, newState("zod"), nil); err == nil || err.Error() != "Schema generation failed for 1 schema" {
		t.Errorf("conversion error: %v", err)
	}
	if e := log.Entries(); len(e) != 1 || e[0].Level != diag.Error || e[0].Message != "Could not convert Zod schema 'In': boom" {
		t.Errorf("diagnostics %+v", e)
	}
}

func TestGenerateAllLogsGeneratorErrors(t *testing.T) {
	dir := writeProject(t, map[string]string{
		"tsconfig.json": `{}`,
		"t.ts":          "export type Shout = Uppercase<string>\n",
	})
	st := state.New(dir)
	// Only what the virtual file imports is in the program.
	st.Functions.TypesMap.AddType("Shout", filepath.Join(dir, "t.ts"))
	st.Functions.TypesMap.AddCustomType("Holder", "{ n: number }", []string{"Shout"})

	log := &diag.Logger{}
	got, err := GenerateAll(log, Config{Tsconfig: filepath.Join(dir, "tsconfig.json"), SchemasFromTypes: []string{"Shout"}}, st, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Has("Shout") {
		t.Errorf("failed schema was kept: %s", got.At("Shout"))
	}
	e := log.Entries()
	if len(e) != 1 || e[0].Level != diag.Error ||
		!strings.HasPrefix(e[0].Message, "[PKU456] Error generating schema: Shout. Message: ") ||
		!strings.HasSuffix(e[0].Message, ". Type info: not in typesMap") {
		t.Errorf("diagnostics %+v", e)
	}
}
