package jsjson

import "testing"

// Expected strings are JSON.stringify output from node.
var tenth = 0.1

func TestMatchesJSONStringify(t *testing.T) {
	cases := []struct {
		in   any
		want string
	}{
		{"<a&b>", `"<a&b>"`},
		{"  ", "\"  \""},
		{"\b\f\n\r\t\x00\x1f\"\\", `"\b\f\n\r\t\u0000\u001f\"\\"`},
		{"é😀", `"é😀"`},
		{1e21, `1e+21`},
		{1.5e-7, `1.5e-7`},
		{123456789012345680000.0, `123456789012345680000`},
		{tenth + 2*tenth, `0.30000000000000004`},
		{map[string]any{"a": []any{}}, `{"a":[]}`},
	}
	for _, c := range cases {
		if got := string(MustMarshal(c.in)); got != c.want {
			t.Errorf("%#v: got %s want %s", c.in, got, c.want)
		}
	}
}

func TestUnescapeOnlyRealEscapes(t *testing.T) {
	// A literal backslash followed by "u2028" text must stay escaped.
	in := `"\\u2028  "`
	want := "\"\\\\u2028  \""
	if got := string(UnescapeLineSeparators([]byte(in))); got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestIndent(t *testing.T) {
	got, _ := Marshal(map[string]any{"a": []int{1}}, "  ")
	if string(got) != "{\n  \"a\": [\n    1\n  ]\n}" {
		t.Fatalf("%q", got)
	}
}
