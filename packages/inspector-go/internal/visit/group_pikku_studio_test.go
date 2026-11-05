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
