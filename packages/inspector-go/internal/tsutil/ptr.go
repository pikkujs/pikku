package tsutil

func BoolPtr(b bool) *bool { return &b }

// OrNil returns &b when b is true, mirroring the TS `x || undefined` idiom.
func OrNil(b bool) *bool {
	if b {
		return &b
	}
	return nil
}

func StrPtr(s string) *string { return &s }
