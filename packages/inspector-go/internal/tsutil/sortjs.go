package tsutil

import (
	"sort"
	"unicode/utf16"
)

// SortStringsJS sorts the way Array#sort does without a comparator: by UTF-16
// code units.
func SortStringsJS(values []string) {
	sort.SliceStable(values, func(i, j int) bool {
		a, b := utf16.Encode([]rune(values[i])), utf16.Encode([]rune(values[j]))
		for k := 0; k < len(a) && k < len(b); k++ {
			if a[k] != b[k] {
				return a[k] < b[k]
			}
		}
		return len(a) < len(b)
	})
}
