package visit

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
)

func TestValidateStudioAgentKeepsTheFieldWhoseKeyExists(t *testing.T) {
	en := map[string]json.RawMessage{
		"agent_title":       json.RawMessage(`"Assistant"`),
		"agent_description": json.RawMessage(`"Helps"`),
	}
	const missing = "definePlugin uses the message key 'nope', which is missing from the addon's messages/en.json"
	cases := []struct {
		name, frontmatter, want string
		wantKeys                []string
	}{
		{
			name:        "description key missing",
			frontmatter: "---\ntitle: agent_title\ndescription: nope\n---\nHi\n",
			want:        `,"agentTitle":"agent_title"`,
			wantKeys:    []string{"agent_title", "nope"},
		},
		{
			name:        "title key missing",
			frontmatter: "---\ntitle: nope\ndescription: agent_description\n---\nHi\n",
			want:        `,"agentDescription":"agent_description"`,
			wantKeys:    []string{"nope", "agent_description"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			writeFiles(t, root, map[string]string{"agents/helper.md": tc.frontmatter})
			s := &Context{Log: &diag.Logger{}}

			got, keys, valid := s.validateStudioAgent("/assist", "helper", root, en)

			if got != tc.want {
				t.Errorf("extra = %s, want %s", got, tc.want)
			}
			if !reflect.DeepEqual(keys, tc.wantKeys) {
				t.Errorf("keys = %v, want %v", keys, tc.wantKeys)
			}
			if !valid {
				t.Error("a missing key is PKU358, which leaves the agent valid")
			}
			entries := s.Log.Entries()
			if len(entries) != 1 || entries[0].Code != diag.StudioMessageKeyMissing || entries[0].Message != missing {
				t.Errorf("diagnostics = %+v", entries)
			}
		})
	}
}

func TestStudioMessageKeysCoverWidgetsThingsAndArrangedScreens(t *testing.T) {
	raw := `{
	  "title": "t", "file": "f", "screens": [{"title": "s"}],
	  "widgets": [{"id": "w", "title": "w_t", "description": "w_d"}],
	  "things": [{"kind": "k", "label": "k_l",
	    "copy": {"failed": {"name": "k_n", "lead": "k_lead", "compact": "k_c", "primary": {"label": "k_p", "draft": "k_dr"}}},
	    "parts": [{"widget": "x", "from": "y", "copy": {"a": {"headline": "p_a"}}, "own": false}],
	    "actions": [{"id": "f", "run": "admin:f", "label": "a_l", "confirm": "a_c", "destructive": true}]}],
	  "arrangedScreens": [{"id": "h", "title": "h_t", "about": "h_a",
	    "slots": [{"widget": "v", "from": "v", "copy": {"wrong": {"headline": "v_w"}, "fine": {"headline": "v_f"}}, "own": false}]}]
	}`
	var studio studioView
	if err := json.Unmarshal([]byte(raw), &studio); err != nil {
		t.Fatal(err)
	}
	want := []string{"t", "s", "w_t", "w_d", "k_l", "k_n", "k_lead", "k_c", "k_p", "k_dr", "p_a", "a_l", "a_c", "h_t", "h_a", "v_w", "v_f"}
	if got := studio.messageKeys(); !reflect.DeepEqual(got, want) {
		t.Errorf("keys = %v, want %v", got, want)
	}
}

func TestStudioManifestDeclaresUI(t *testing.T) {
	for raw, want := range map[string]bool{
		`{"screens": []}`:                                   false,
		`{"screens": [], "widgets": []}`:                    false,
		`{"screens": [{"path": "/a"}]}`:                     true,
		`{"screens": [], "arrangedScreens": [{"id": "h"}]}`: true,
		`{"things": [{"kind": "k"}]}`:                       true,
		`{"widgets": [{"id": "w"}]}`:                        true,
	} {
		m, err := parseOJSON([]byte(raw))
		if err != nil {
			t.Fatal(err)
		}
		if got := studioManifestDeclaresUI(m); got != want {
			t.Errorf("%s: got %v, want %v", raw, got, want)
		}
	}
}
