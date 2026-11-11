package state

import (
	"encoding/json"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
)

// Raw holds an already-encoded JSON value verbatim, key order included. It is
// the element type of every section whose visitor group is not ported yet: an
// unported group never writes it, so it stays empty, and a state decoded from
// the TS serializer (or a later Go finalize reading one) round-trips it byte
// for byte. When a group is ported its section gets a typed struct and Raw
// drops out of it.
type Raw []byte

func (r Raw) MarshalJSON() ([]byte, error) {
	if len(r) == 0 {
		return []byte("null"), nil
	}
	return r, nil
}

func (r *Raw) UnmarshalJSON(b []byte) error {
	*r = append((*r)[:0], b...)
	return nil
}

// RawOf encodes v as a Raw.
func RawOf(v any) Raw { return Raw(jsjson.MustMarshal(v)) }

// Decode unmarshals the raw value into v.
func (r Raw) Decode(v any) error { return json.Unmarshal(r, v) }
