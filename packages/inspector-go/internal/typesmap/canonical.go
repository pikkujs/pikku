package typesmap

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf16"
)

// CanonicalTypeString is utils/canonical-type-string.ts: a printed type with
// the members of every union in it sorted by text, `null` and `undefined`
// last, and everything else left byte for byte. tsgo keeps a union's members
// sorted by value where Strada keeps them in creation order, so neither order
// can be trusted; both engines run canonical-type-string.cases.json.
func CanonicalTypeString(typ string) string {
	body := strings.TrimLeft(typ, " \t\n\r")
	lead := len(typ) - len(body)
	if lead == len(typ) {
		return typ
	}
	body = strings.TrimRight(body, " \t\n\r")
	end := lead + len(body)
	return typ[:lead] + canonicalBody(body) + typ[end:]
}

const (
	openers = "{[(<"
	closers = "}])>"
	quotes  = "\"'`"
)

var (
	closeOf     = map[byte]byte{'{': '}', '[': ']', '(': ')', '<': '>'}
	unsplitWord = map[string]bool{"extends": true, "is": true, "asserts": true, "infer": true, "as": true}
	mappedKey   = regexp.MustCompile(`^[A-Za-z_$][\w$]*[ \t\n\r]+in[ \t\n\r]`)
	nonWord     = regexp.MustCompile(`[^A-Za-z0-9_$]+`)
)

func commentEnd(s string, i int) int {
	if s[i] != '/' || i+1 >= len(s) {
		return -1
	}
	switch s[i+1] {
	case '*':
		if end := strings.Index(s[i+2:], "*/"); end != -1 {
			return i + 2 + end + 2
		}
		return len(s)
	case '/':
		if end := strings.IndexByte(s[i+2:], '\n'); end != -1 {
			return i + 2 + end
		}
		return len(s)
	}
	return -1
}

// topLevel is s with everything inside brackets, string literals and comments
// blanked, and its outermost bracket pairs.
func topLevel(s string) (string, [][2]int) {
	mask := []byte(strings.Repeat(" ", len(s)))
	var groups [][2]int
	depth, open := 0, -1
	for i := 0; i < len(s); i++ {
		c := s[i]
		if strings.IndexByte(quotes, c) != -1 {
			j := i + 1
			for j < len(s) && s[j] != c {
				if s[j] == '\\' {
					j += 2
				} else {
					j++
				}
			}
			i = j
			continue
		}
		if end := commentEnd(s, i); end != -1 {
			i = end - 1
			continue
		}
		switch {
		case strings.IndexByte(openers, c) != -1:
			if depth == 0 {
				open = i
			}
			depth++
		case strings.IndexByte(closers, c) != -1 && !(c == '>' && i > 0 && s[i-1] == '='):
			if depth > 0 {
				depth--
			}
			if depth == 0 && open != -1 && closeOf[s[open]] == c {
				groups = append(groups, [2]int{open, i})
				open = -1
			}
		case depth == 0:
			mask[i] = c
		}
	}
	return string(mask), groups
}

func isNullish(member string) bool { return member == "null" || member == "undefined" }

// lessUTF16 compares by UTF-16 code units, as JS `<` does.
func lessUTF16(a, b string) bool {
	ua, ub := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			return ua[i] < ub[i]
		}
	}
	return len(ua) < len(ub)
}

func sortMembers(members []string) {
	sort.SliceStable(members, func(i, j int) bool {
		a, b := members[i], members[j]
		if isNullish(a) != isNullish(b) {
			return !isNullish(a)
		}
		return lessUTF16(a, b)
	})
}

func unsplittable(mask string) bool {
	if strings.ContainsAny(mask, "?:") {
		return true
	}
	for i := 0; i < len(mask); i++ {
		if mask[i] == '=' && (i+1 >= len(mask) || mask[i+1] != '>') {
			return true
		}
	}
	for _, word := range nonWord.Split(mask, -1) {
		if unsplitWord[word] {
			return true
		}
	}
	return false
}

func canonicalBody(body string) string {
	mask, _ := topLevel(body)
	if arrow := strings.Index(mask, "=>"); arrow != -1 && !strings.Contains(mask[:arrow], "|") {
		return rewriteGroups(body[:arrow]) + "=>" + CanonicalTypeString(body[arrow+2:])
	}
	if key := mappedKey.FindString(mask); key != "" {
		return body[:len(key)] + CanonicalTypeString(body[len(key):])
	}
	if !strings.Contains(mask, "|") || unsplittable(mask) {
		return rewriteGroups(body)
	}
	var members []string
	start := 0
	for i := 0; i <= len(mask); i++ {
		if i == len(mask) || mask[i] == '|' {
			if member := strings.Trim(CanonicalTypeString(body[start:i]), " \t\n\r"); member != "" {
				members = append(members, member)
			}
			start = i + 1
		}
	}
	if len(members) < 2 {
		return rewriteGroups(body)
	}
	sortMembers(members)
	return strings.Join(members, " | ")
}

// rewriteGroups is s with the contents of each outermost bracket pair
// canonicalized.
func rewriteGroups(s string) string {
	_, groups := topLevel(s)
	var out strings.Builder
	last := 0
	for _, g := range groups {
		out.WriteString(s[last : g[0]+1])
		out.WriteString(rewriteList(s[g[0]+1:g[1]], s[g[0]]))
		last = g[1]
	}
	out.WriteString(s[last:])
	return out.String()
}

// rewriteList is a bracket's contents: members of an object, parameters, or
// type arguments.
func rewriteList(inner string, opener byte) string {
	separators := ","
	if opener == '{' {
		separators = ";,"
	}
	mask, _ := topLevel(inner)
	var out strings.Builder
	start := 0
	for i := 0; i <= len(mask); i++ {
		if i == len(mask) || strings.IndexByte(separators, mask[i]) != -1 {
			out.WriteString(rewriteItem(inner[start:i], opener))
			if i < len(inner) {
				out.WriteByte(inner[i])
			}
			start = i + 1
		}
	}
	return out.String()
}

func rewriteItem(item string, opener byte) string {
	if opener == '<' {
		return CanonicalTypeString(item)
	}
	mask, _ := topLevel(item)
	colon := strings.IndexByte(mask, ':')
	if colon == -1 {
		return CanonicalTypeString(item)
	}
	return rewriteGroups(item[:colon]) + ":" + CanonicalTypeString(item[colon+1:])
}
