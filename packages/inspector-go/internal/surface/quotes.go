package surface

import "strings"

// doubleQuoteLiterals rewrites the single-quoted string literal types in a
// printed type as double-quoted ones. typescript-go reuses a declaration's
// own type nodes and keeps their quote style; Strada's typeToString always
// prints a literal type with double quotes. A single-quoted property name,
// which both keep as declared, is left alone.
func doubleQuoteLiterals(s string) string {
	if !strings.Contains(s, "'") {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		c := s[i]
		switch c {
		case '"', '`':
			end := closingQuote(s, i)
			b.WriteString(s[i:end])
			i = end
		case '\'':
			end := closingQuote(s, i)
			rest := s[end:]
			if strings.HasPrefix(rest, ":") || strings.HasPrefix(rest, "?:") || strings.HasPrefix(rest, "(") {
				b.WriteString(s[i:end])
			} else {
				b.WriteString(requote(s[i+1 : end-1]))
			}
			i = end
		default:
			b.WriteByte(c)
			i++
		}
	}
	return b.String()
}

// closingQuote returns the index just past the quote that closes the string
// opened at s[start], or len(s) when it is unterminated.
func closingQuote(s string, start int) int {
	quote := s[start]
	for i := start + 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			i++
		case quote:
			return i + 1
		}
	}
	return len(s)
}

func requote(body string) string {
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(body); i++ {
		c := body[i]
		if c == '\\' && i+1 < len(body) {
			if body[i+1] == '\'' {
				b.WriteByte('\'')
			} else {
				b.WriteByte(c)
				b.WriteByte(body[i+1])
			}
			i++
			continue
		}
		if c == '"' {
			b.WriteString(`\"`)
			continue
		}
		b.WriteByte(c)
	}
	b.WriteByte('"')
	return b.String()
}
