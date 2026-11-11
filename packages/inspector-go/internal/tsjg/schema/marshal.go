package schema

import (
	"bytes"
	"encoding/json"
)

// MarshalStable renders a schema the way the CLI emits it: HTML escaping
// off, two-space indentation unless minify, one trailing newline. With
// sortProps the value is round-tripped through generic maps so keys emit in
// sorted order, matching safe-stable-stringify in the original CLI.
func MarshalStable(schema any, sortProps, minify bool) ([]byte, error) {
	value := schema
	if sortProps {
		raw, err := json.Marshal(schema)
		if err != nil {
			return nil, err
		}
		var generic any
		if err := json.Unmarshal(raw, &generic); err != nil {
			return nil, err
		}
		value = generic
	}

	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if !minify {
		encoder.SetIndent("", "  ")
	}
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	// Encode appends exactly one trailing newline, which we keep.
	return buf.Bytes(), nil
}
