package visit

import (
	"reflect"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

func TestNamedSourceTypesFollowsCustomTypesAndSkipsCore(t *testing.T) {
	tm := typesmap.New()
	tm.AddType("Note", "/app/src/notes.ts")
	tm.AddType("MCPToolResponse", "/app/node_modules/@pikku/core/dist/mcp.d.ts")
	tm.AddCustomType("ListNotesOutput", "Note[]", []string{"Note"})
	tm.AddCustomType("GetNoteOutput", "{ body: string }", nil)

	if got := namedSourceTypes(tm, []string{"ListNotesOutput", "string"}); !reflect.DeepEqual(got, []string{"Note"}) {
		t.Fatalf("custom alias over a source type: got %v", got)
	}
	if got := namedSourceTypes(tm, []string{"GetNoteOutput", "MCPToolResponse", "Missing"}); len(got) != 0 {
		t.Fatalf("inline, core and unknown types are not source types: got %v", got)
	}
}

func TestAddonZodContractViolation(t *testing.T) {
	tm := typesmap.New()
	tm.AddType("Note", "/app/src/notes.ts")

	if v := addonZodContractViolation(tm, addonContractTypeSource{name: "getNote", hasInputSchema: true, hasOutputSchema: true, inputNames: []string{"GetNoteInput"}, outputNames: []string{"Note"}}); v != "" {
		t.Fatalf("zod contract refused: %s", v)
	}
	v := addonZodContractViolation(tm, addonContractTypeSource{name: "getNote", usesGenerics: true, outputNames: []string{"Note"}})
	for _, want := range []string{"'getNote' is remote: true", "TypeScript generics", "named source types (Note)", "must be zod schemas"} {
		if !strings.Contains(v, want) {
			t.Errorf("violation %q lacks %q", v, want)
		}
	}
}
