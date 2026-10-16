package finalize

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"unicode/utf16"
)

// CanonicalJSON ports utils/hash.ts canonicalJSON: JSON.stringify of the
// value with every object's keys sorted (Array#sort, UTF-16 code unit order;
// array-index keys still enumerate first, as they do in any JS object).
func CanonicalJSON(v any) string {
	b, err := Marshal(sortDeep(v))
	if err != nil {
		panic(err)
	}
	return string(b)
}

func sortDeep(v any) any {
	switch v := v.(type) {
	case []any:
		out := make([]any, len(v))
		for i, x := range v {
			out[i] = sortDeep(x)
		}
		return out
	case *Object:
		keys := v.Keys()
		SortJS(keys)
		out := NewObject()
		for _, k := range keys {
			out.Set(k, sortDeep(v.Get(k)))
		}
		return out
	}
	return v
}

// SortJS sorts strings the way Array#sort does without a comparator.
func SortJS(keys []string) {
	sort.SliceStable(keys, func(i, j int) bool { return LessUTF16(keys[i], keys[j]) })
}

// LessUTF16 compares two strings by UTF-16 code units, as JS `<` does.
func LessUTF16(a, b string) bool {
	if isASCII(a) && isASCII(b) {
		return a < b
	}
	ua, ub := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			return ua[i] < ub[i]
		}
	}
	return len(ua) < len(ub)
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			return false
		}
	}
	return true
}

// HashString ports utils/hash.ts hashString: the first `length` hex digits
// of the SHA-256 of the input.
func HashString(input string, length int) string {
	sum := sha256.Sum256([]byte(input))
	h := hex.EncodeToString(sum[:])
	if length > len(h) {
		length = len(h)
	}
	return h[:length]
}
