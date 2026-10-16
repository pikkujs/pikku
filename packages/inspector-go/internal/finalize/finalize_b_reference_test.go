package finalize

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// TestFinalizeBAgainstReference applies the finalize-b steps to a TypeScript
// pre-finalize state and compares the sections they own with the TypeScript
// post-finalize state. FINALIZE_REFERENCE names a JSON file holding
// { pre, post (comparableState), openAPISpecRaw, options }.
func TestFinalizeBAgainstReference(t *testing.T) {
	path := os.Getenv("FINALIZE_REFERENCE")
	if path == "" {
		t.Skip("FINALIZE_REFERENCE not set")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var ref struct {
		Pre            json.RawMessage  `json:"pre"`
		Post           json.RawMessage  `json:"post"`
		OpenAPISpecRaw json.RawMessage  `json:"openAPISpecRaw"`
		Options        protocol.Options `json:"options"`
	}
	if err := json.Unmarshal(b, &ref); err != nil {
		t.Fatal(err)
	}
	st := &state.State{}
	if err := json.Unmarshal(ref.Pre, st); err != nil {
		t.Fatal(err)
	}
	log := &diag.Logger{}
	opts := ref.Options
	if !opts.SetupOnly {
		if opts.SchemaConfig != nil {
			ComputeContractHashes(st)
		}
		LoadAddonSchemas(log, st)
		if err := ApplyManifest(st, opts.Manifest); err != nil {
			t.Fatal(err)
		}
		for _, step := range []func(*state.State) error{FinalizeWorkflows, FinalizeWorkflowHelperTypes, FinalizeWorkflowWires} {
			if err := step(st); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := GetFilesAndMethods(st, opts.Types); err != nil {
		t.Fatal(err)
	}
	if !opts.SetupOnly && len(opts.OpenAPI) > 0 && string(opts.OpenAPI) != "null" {
		if err := GenerateOpenAPISpec(log, st, opts.OpenAPI); err != nil {
			t.Fatal(err)
		}
		t.Logf("openAPISpec: %d bytes", len(st.OpenAPISpec))
		want, _ := Parse(ref.OpenAPISpecRaw)
		wantBytes, _ := Marshal(want)
		if string(st.OpenAPISpec) != string(wantBytes) {
			os.WriteFile(path+".openapi.go.json", st.OpenAPISpec, 0o644)
			os.WriteFile(path+".openapi.ts.json", wantBytes, 0o644)
			t.Errorf("openAPISpec differs (written beside %s)", path)
		}
	}

	postV, err := Parse(ref.Post)
	if err != nil {
		t.Fatal(err)
	}
	post := AsObject(postV)
	got := func(v any) any {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		x, _ := Parse(b)
		return x
	}
	compare := func(name string, g, w any) {
		if CanonicalJSON(g) != CanonicalJSON(w) {
			os.WriteFile(path+"."+name+".go.json", []byte(CanonicalJSON(g)), 0o644)
			os.WriteFile(path+"."+name+".ts.json", []byte(CanonicalJSON(w)), 0o644)
			t.Errorf("%s differs (written beside %s)", name, path)
		}
	}
	tsFunctions := AsObject(post.Get("functions"))
	// Only the members finalize-b writes; the rest belong to post-process.
	ownFields := func(v any) any {
		out := NewObject()
		meta := AsObject(v)
		for _, id := range meta.Keys() {
			fn := AsObject(meta.Get(id))
			o := NewObject()
			fields := []string{"contractHash", "inputHash", "outputHash"}
			// post-process.ts renames non-helper input schemas afterwards.
			if fn.Get("functionType") == "helper" {
				fields = append(fields, "inputSchemaName", "inputs")
			}
			for _, f := range fields {
				o.Set(f, fn.Get(f))
			}
			out.Set(id, o)
		}
		return out
	}
	compare("functions.meta", ownFields(got(&st.Functions.Meta)), ownFields(tsFunctions.Get("meta")))
	compare("schemas", got(&st.Schemas), post.Get("schemas"))
	compare("manifest", got(&st.Manifest), post.Get("manifest"))
	compare("workflows.graphMeta", got(&st.Workflows.GraphMeta), AsObject(post.Get("workflows")).Get("graphMeta"))
	compare("filesAndMethods", got(&st.FilesAndMethods), post.Get("filesAndMethods"))
	errs := []any{}
	st.FilesAndMethodsErrors.Each(func(msg string, m state.PathToNameAndType) {
		inner := []any{}
		m.Each(func(file string, list []state.NameAndType) {
			inner = append(inner, []any{file, got(list)})
		})
		errs = append(errs, []any{msg, Obj("__map", inner)})
	})
	compare("filesAndMethodsErrors", Obj("__map", errs), post.Get("filesAndMethodsErrors"))
}
