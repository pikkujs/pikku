package surface

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// object is a JSON object that keeps its keys in source order, as
// Object.entries does for the non-index keys a package.json uses.
type object struct {
	keys   []string
	values map[string]any
}

func (o *object) get(key string) (any, bool) {
	v, ok := o.values[key]
	return v, ok
}

func decodeOrdered(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := decodeValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("trailing data after JSON value")
	}
	return v, nil
}

func decodeValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			o := &object{values: map[string]any{}}
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key, _ := kt.(string)
				v, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				if _, seen := o.values[key]; !seen {
					o.keys = append(o.keys, key)
				}
				o.values[key] = v
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return o, nil
		case '[':
			var arr []any
			for dec.More() {
				v, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			if arr == nil {
				arr = []any{}
			}
			return arr, nil
		}
	}
	return tok, nil
}
