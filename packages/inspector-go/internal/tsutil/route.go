package tsutil

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

func RouteMatchesPattern(route, pattern string) bool {
	if route == pattern {
		return true
	}
	re := strings.ReplaceAll(regexp.QuoteMeta(pattern), `\*`, ".*")
	return regexp.MustCompile("^" + re + "$").MatchString(route)
}

// PathParams is `pathToRegexp(path).keys.filter(k => k.type === 'param')
// .map(k => k.name)` for path-to-regexp v8.4: optional `{...}` groups are
// flattened into every combination (with the group first, then without), each
// contributing its keys, so a name can repeat. The error carries
// path-to-regexp's PathError message.
func PathParams(path string) ([]string, error) {
	tokens, err := parsePath(path)
	if err != nil {
		return nil, err
	}
	var params []string
	combinations := 0
	var failure error
	flattenPath(tokens, 0, nil, func(seq []pathToken) {
		if failure != nil {
			return
		}
		if combinations >= 256 {
			failure = pathError("Too many path combinations", path)
			return
		}
		combinations++
		prevCapture, backtrack := false, ""
		for _, t := range seq {
			switch t.kind {
			case "text":
				backtrack += t.value
			default:
				if prevCapture && backtrack == "" {
					failure = pathError("Missing text before \""+t.name+"\" "+t.kind, path)
					return
				}
				if t.kind == "param" {
					params = append(params, t.name)
				}
				prevCapture, backtrack = true, ""
			}
		}
	})
	if failure != nil {
		return nil, failure
	}
	return params, nil
}

type pathToken struct {
	kind   string // text | param | wildcard | group
	value  string
	name   string
	tokens []pathToken
}

func pathError(msg, path string) error {
	if path != "" {
		msg += ": " + path
	}
	return errors.New(msg + "; visit https://git.new/pathToRegexpError for info")
}

func isIDStart(r rune) bool {
	return r == '$' || r == '_' || unicode.In(r, unicode.L, unicode.Nl, unicode.Other_ID_Start)
}

func isIDContinue(r rune) bool {
	return r == '$' || r == '\u200c' || r == '\u200d' || isIDStart(r) ||
		unicode.In(r, unicode.Mn, unicode.Mc, unicode.Nd, unicode.Pc, unicode.Other_ID_Continue)
}

// parsePath is path-to-regexp's parse(); indexes are code-point indexes, as
// `[...str]` gives.
func parsePath(str string) ([]pathToken, error) {
	chars := []rune(str)
	index := 0
	var consume func(end rune) ([]pathToken, error)
	consume = func(end rune) ([]pathToken, error) {
		var out []pathToken
		text := ""
		flush := func() {
			if text != "" {
				out = append(out, pathToken{kind: "text", value: text})
				text = ""
			}
		}
		for index < len(chars) {
			c := chars[index]
			index++
			if end != 0 && c == end {
				flush()
				return out, nil
			}
			switch c {
			case '\\':
				if index == len(chars) {
					return nil, pathError(fmt.Sprintf("Unexpected end after \\ at index %d", index), str)
				}
				text += string(chars[index])
				index++
				continue
			case ':', '*':
				kind := "param"
				if c == '*' {
					kind = "wildcard"
				}
				name := ""
				if index < len(chars) && isIDStart(chars[index]) {
					for {
						name += string(chars[index])
						index++
						if index >= len(chars) || !isIDContinue(chars[index]) {
							break
						}
					}
				} else if index < len(chars) && chars[index] == '"' {
					quoteStart := index
					for index < len(chars) {
						index++
						if index < len(chars) && chars[index] == '"' {
							index++
							quoteStart = 0
							break
						}
						if index < len(chars) && chars[index] == '\\' {
							index++
						}
						if index < len(chars) {
							name += string(chars[index])
						}
					}
					if quoteStart != 0 {
						return nil, pathError(fmt.Sprintf("Unterminated quote at index %d", quoteStart), str)
					}
				}
				if name == "" {
					return nil, pathError(fmt.Sprintf("Missing parameter name at index %d", index), str)
				}
				flush()
				out = append(out, pathToken{kind: kind, name: name})
				continue
			case '{':
				flush()
				group, err := consume('}')
				if err != nil {
					return nil, err
				}
				out = append(out, pathToken{kind: "group", tokens: group})
				continue
			case '}', '(', ')', '[', ']', '+', '?', '!':
				return nil, pathError(fmt.Sprintf("Unexpected %c at index %d", c, index-1), str)
			}
			text += string(c)
		}
		if end != 0 {
			return nil, pathError(fmt.Sprintf("Unexpected end at index %d, expected %c", index, end), str)
		}
		flush()
		return out, nil
	}
	return consume(0)
}

// flattenPath is path-to-regexp's flatten(): every sequence with each group
// either included or not, included first.
func flattenPath(tokens []pathToken, index int, result []pathToken, cb func([]pathToken)) {
	for index < len(tokens) {
		t := tokens[index]
		index++
		if t.kind == "group" {
			n := len(result)
			rest := index
			flattenPath(t.tokens, 0, result, func(seq []pathToken) {
				flattenPath(tokens, rest, seq, cb)
			})
			result = result[:n]
			continue
		}
		result = append(result, t)
	}
	cb(result)
}
