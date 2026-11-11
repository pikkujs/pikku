package state

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

// The goldens are JSON.stringify(serializeInspectorState(...)) output from the
// TS inspector; see the node one-liners in PORTING.md ("State goldens").

func TestInitialStateMatchesTSSerializer(t *testing.T) {
	want, err := os.ReadFile("testdata/initial.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	got, err := New("/root/x").Marshal("")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("initial state differs from TS\n got: %s\nwant: %s", got, want)
	}
}

func TestPopulatedStateMatchesTSSerializer(t *testing.T) {
	want, err := os.ReadFile("testdata/populated.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	s := New("/root/ x<&>")
	s.Schemas.Set("b", Raw(`{"x":" \u0007\"\\é😀","n":1.5e-7,"big":1e+21}`))
	s.Schemas.Set("10", Raw(`1`))
	s.Schemas.Set("2", Raw(`[true,null]`))
	s.Functions.TypesMap.AddType("Foo", "/a/foo.ts")
	s.Functions.TypesMap.AddCustomType("Bar", "{a:string}", []string{"Foo"})
	out := "Foo"
	s.Functions.Meta.Set("z", &FunctionMeta{
		PikkuFuncId: "z", FunctionType: "user", Name: "z",
		Services:         ServicesMeta{Optimized: true, Services: []string{"a"}},
		OutputSchemaName: &out, Inputs: []string{}, Outputs: []string{"Foo"},
		Expose: ptr(true), Tags: []string{"t"},
	})
	get, _ := s.HTTP.Meta.Get("get")
	get.Set("/a/:id", &HTTPRouteMeta{PikkuFuncId: "z", Route: "/a/:id", SourceFile: "/f.ts", Method: "get", Params: []string{"id"}})
	s.HTTP.Files.Add("/f.ts")
	s.Secrets.Usage.Set("/f.ts", &SecretUsage{Keys: Strings{"K"}})
	syms := NewRecord[*SurfaceUsage]()
	syms.Set("y", &SurfaceUsage{Imports: 2, SeenIn: Strings{"src"}, Files: Strings{"a.ts"}})
	s.SurfaceUsage.Set("#pikku/x", syms)
	typ := "S"
	s.SingletonServicesTypeImportMap.Set("/s.ts", []NameAndType{{Variable: "S", Type: &typ}})
	fns := NewSet()
	fns.Add("z")
	s.RPC.InvokedFunctionsByFile.Set("/f.ts", fns)

	got, err := s.Marshal("  ")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		os.WriteFile(os.TempDir()+"/populated.got.json", got, 0o644)
		t.Fatalf("populated state differs from TS; got written to %s/populated.got.json", os.TempDir())
	}
}

func TestStateRoundTripsTSOutput(t *testing.T) {
	want, err := os.ReadFile("testdata/populated.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var s State
	if err := json.Unmarshal(want, &s); err != nil {
		t.Fatal(err)
	}
	got, err := s.Marshal("  ")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("decode/encode is not the identity:\n%s", got)
	}
}

func TestRecordKeyOrder(t *testing.T) {
	r := NewRecord[int]()
	for i, k := range []string{"b", "10", "a", "2", "01", "4294967295", "4294967294"} {
		r.Set(k, i)
	}
	r.Set("b", 9) // re-set keeps position
	got := string(must(r.MarshalJSON()))
	want := `{"2":3,"10":1,"4294967294":6,"b":9,"a":2,"01":4,"4294967295":5}`
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
	r.Delete("b")
	r.Set("b", 0) // delete + re-add moves to the end
	if keys := r.Keys(); keys[len(keys)-1] != "b" {
		t.Fatalf("re-added key not last: %v", keys)
	}
}

func TestMapAndSetEncoding(t *testing.T) {
	var m Map[int]
	m.Set("2", 1)
	m.Set("1", 2)
	if got := string(must(m.MarshalJSON())); got != `[["2",1],["1",2]]` {
		t.Fatal(got)
	}
	var s Set
	if got := string(must(s.MarshalJSON())); got != `[]` {
		t.Fatal(got)
	}
	s.Add("b")
	s.Add("a")
	s.Add("b")
	if got := string(must(s.MarshalJSON())); got != `["b","a"]` {
		t.Fatal(got)
	}
}

func ptr[T any](v T) *T { return &v }

func must(b []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return b
}
