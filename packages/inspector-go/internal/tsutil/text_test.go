package tsutil

import "testing"

func TestUTF16Offset(t *testing.T) {
	text := "// café 😀\nconst x = 1"
	// JS: text.indexOf('const') === 11 ('é' is 1 unit, '😀' is 2).
	byteOff := len("// café 😀\n")
	if got := UTF16Offset(text, byteOff); got != 11 {
		t.Fatalf("UTF16Offset = %d, want 11", got)
	}
}
