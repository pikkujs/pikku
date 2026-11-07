package sourcescan

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// testdata/pikku-call/cases.json was produced by CodeEditService.findPikkuCall
// on TypeScript 6 over the same sources.
func TestFindPikkuCallMatchesTypeScriptReference(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/pikku-call/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Content string    `json:"content"`
		Name    string    `json:"name"`
		Want    PikkuCall `json:"want"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	found := 0
	for _, c := range cases {
		got := FindPikkuCall(c.Content, c.Name)
		if got.Found {
			found++
		}
		if !reflect.DeepEqual(got, c.Want) {
			g, _ := json.Marshal(got)
			w, _ := json.Marshal(c.Want)
			t.Errorf("%q in %q:\n got  %s\n want %s", c.Name, c.Content, g, w)
		}
	}
	if found == 0 {
		t.Fatal("the golden set found no pikku call")
	}
}

func TestReadImportsReportsInsertionPointsInUTF16(t *testing.T) {
	content := "// 😀\nimport { a, b } from 'x'\nimport {} from 'empty'\nimport def from 'd'\nconst s = '😀'\n"
	got := ReadImports(content)
	at := func(n int) *int { return &n }
	want := ImportsInfo{
		LastImportEnd: 73,
		Imports: []ImportClauseInfo{
			{Module: "x", Names: []string{"a", "b"}, InsertAt: at(19), End: 30},
			{Module: "empty", Names: []string{}, InsertAt: at(39), End: 53},
			{Module: "d", Names: []string{}, End: 73},
		},
	}
	if !reflect.DeepEqual(got, want) {
		g, _ := json.Marshal(got)
		w, _ := json.Marshal(want)
		t.Errorf("got  %s\nwant %s", g, w)
	}
}
