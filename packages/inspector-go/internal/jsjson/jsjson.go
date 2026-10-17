// Package jsjson encodes JSON byte-compatibly with JavaScript's
// JSON.stringify.
//
// encoding/json already formats float64 the way ES6 does and, with HTML
// escaping off, escapes the same characters JSON.stringify escapes — with one
// exception: it writes U+2028 and U+2029 as   /  , which
// JSON.stringify leaves raw. Marshal undoes exactly those two escapes.
package jsjson

import (
	"bytes"
	"encoding/json"
)

// Marshal encodes v like JSON.stringify(v, null, indent). An empty indent
// gives the compact form.
func Marshal(v any, indent string) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if indent != "" {
		enc.SetIndent("", indent)
	}
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return UnescapeLineSeparators(bytes.TrimSuffix(buf.Bytes(), []byte{'\n'})), nil
}

// MustMarshal is Marshal for values that cannot fail to encode.
func MustMarshal(v any) []byte {
	b, err := Marshal(v, "")
	if err != nil {
		panic(err)
	}
	return b
}

var (
	ls = []byte(" ")
	ps = []byte(" ")
)

// UnescapeLineSeparators rewrites the escape sequences   and   in
// encoded JSON to the raw characters. A backslash outside a string never
// occurs in JSON, and inside one it always starts an escape, so pairing
// backslashes left to right finds exactly the escapes that encoding/json
// wrote — an escaped backslash followed by the text "u2028" is left alone.
func UnescapeLineSeparators(b []byte) []byte {
	i := bytes.Index(b, []byte(`\u202`))
	if i < 0 {
		return b
	}
	out := make([]byte, 0, len(b))
	for j := 0; j < len(b); j++ {
		c := b[j]
		if c != '\\' || j+1 >= len(b) {
			out = append(out, c)
			continue
		}
		if b[j+1] == 'u' && j+5 < len(b) && b[j+2] == '2' && b[j+3] == '0' && b[j+4] == '2' && (b[j+5] == '8' || b[j+5] == '9') {
			if b[j+5] == '8' {
				out = append(out, ls...)
			} else {
				out = append(out, ps...)
			}
			j += 5
			continue
		}
		out = append(out, c, b[j+1])
		j++
	}
	return out
}
