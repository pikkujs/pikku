package analyze

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

func listFuncRun(t *testing.T) *protocol.Response {
	t.Helper()
	root, files := classificationRequest(t, "../../testdata/list-func")
	tsconfig := filepath.Join(root, "tsconfig.json")
	res, err := Run(protocol.Request{RouteFiles: files, Options: protocol.Options{
		RootDir: root, Tsconfig: tsconfig,
		SchemaConfig: &protocol.SchemaConfig{Tsconfig: tsconfig},
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func schemaOf(t *testing.T, res *protocol.Response, name string) map[string]any {
	t.Helper()
	raw, ok := res.State.Schemas.Get(name)
	if !ok {
		t.Fatalf("no schema %s", name)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func rootOf(schema map[string]any) map[string]any {
	ref, _ := schema["$ref"].(string)
	if ref == "" {
		return schema
	}
	return schema["definitions"].(map[string]any)[strings.TrimPrefix(ref, "#/definitions/")].(map[string]any)
}

func TestListFuncSchemaMatchesGolden(t *testing.T) {
	res := listFuncRun(t)
	got := map[string]any{}
	for _, n := range []string{"ListItemsInput", "ListItemsOutput", "ListTagsInput"} {
		got[n] = schemaOf(t, res, n)
	}
	golden := "../../testdata/list-func/golden.json"
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		b, _ := json.MarshalIndent(got, "", "  ")
		if err := os.WriteFile(golden, append(b, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	b, err := os.ReadFile(golden)
	if err != nil {
		t.Fatal(err)
	}
	var want map[string]any
	if err := json.Unmarshal(b, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		gj, _ := json.MarshalIndent(got, "", "  ")
		t.Errorf("list schemas differ from testdata/list-func/golden.json; set UPDATE_GOLDEN=1 to rewrite.\n%s", gj)
	}
}

func TestListFuncSchemaShape(t *testing.T) {
	res := listFuncRun(t)
	input := schemaOf(t, res, "ListItemsInput")
	props := rootOf(input)["properties"].(map[string]any)
	keys := make([]string, 0, len(props))
	for k := range props {
		keys = append(keys, k)
	}
	if len(keys) != 5 || props["filter"] == nil || props["category"] != nil {
		t.Errorf("properties = %v, want cursor/filter/limit/search/sort and no flat filter fields", keys)
	}
	if ref, _ := props["filter"].(map[string]any)["$ref"].(string); !strings.HasPrefix(ref, "#/definitions/Filter<") {
		t.Errorf("filter = %v, want the recursive Filter", props["filter"])
	}
	sort := props["sort"].(map[string]any)["items"].(map[string]any)["properties"].(map[string]any)["column"].(map[string]any)
	enum := input["definitions"].(map[string]any)[strings.TrimPrefix(sort["$ref"].(string), "#/definitions/")].(map[string]any)["enum"]
	if !reflect.DeepEqual(enum, []any{"createdAt", "label"}) {
		t.Errorf("sort.column enum = %v", enum)
	}
	if rootOf(schemaOf(t, res, "ListTagsInput"))["properties"].(map[string]any)["sort"] != nil {
		t.Error("a list function declaring no sort columns accepts no sort")
	}
	named := rootOf(schemaOf(t, res, "ListNamedInput"))["properties"].(map[string]any)
	if named["filter"] == nil {
		t.Error("a named filter type still nests under filter")
	}
}

func TestGeneratedSchemaUnknownNever(t *testing.T) {
	var got []diag.Diagnostic
	for _, d := range listFuncRun(t).Diagnostics {
		if d.Code == diag.GeneratedSchemaHasUnknown {
			got = append(got, d)
		}
	}
	if len(got) != 1 {
		t.Fatalf("got %d PKU492 diagnostics, want 1 (the never element; the explicit unknown and every list function pass): %+v", len(got), got)
	}
	if got[0].Level != diag.Error ||
		!strings.Contains(got[0].Message, "'readGone' output schema") ||
		!strings.Contains(got[0].Message, "at '.tags[]'") {
		t.Errorf("diagnostic = %+v", got[0])
	}
}
