package sourcescan

import (
	"regexp"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// jsDot is JavaScript's `.` without the s flag: anything but a line terminator.
const jsDot = `[^\n\r\x{2028}\x{2029}]`

// asciiFold writes the letters of a pattern as [xX] classes, outside bracket
// expressions and escapes: JavaScript's /i without /u folds ASCII only, where
// Go's (?i) also folds U+017F and U+212A.
func asciiFold(pattern string) string {
	var b strings.Builder
	inClass := false
	for i := 0; i < len(pattern); i++ {
		c := pattern[i]
		switch {
		case c == '\\' && i+1 < len(pattern):
			b.WriteByte(c)
			i++
			b.WriteByte(pattern[i])
		case c == '[' && !inClass:
			inClass = true
			b.WriteByte(c)
		case c == ']' && inClass:
			inClass = false
			b.WriteByte(c)
		case !inClass && (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'):
			b.WriteString("[" + strings.ToLower(string(c)) + strings.ToUpper(string(c)) + "]")
		default:
			b.WriteByte(c)
		}
	}
	return b.String()
}

// utf16Units is s as JavaScript holds it. A lone surrogate, which a Go string
// carries as its three-byte WTF-8 form, stays one code unit.
func utf16Units(s string) []uint16 {
	units := make([]uint16, 0, len(s))
	for i := 0; i < len(s); {
		if s[i] == 0xed && i+2 < len(s) && s[i+1] >= 0xa0 && s[i+1] <= 0xbf && s[i+2]&0xc0 == 0x80 {
			units = append(units, uint16(0xd000|uint16(s[i+1]&0x3f)<<6|uint16(s[i+2]&0x3f)))
			i += 3
			continue
		}
		r, size := utf8.DecodeRuneInString(s[i:])
		units = utf16.AppendRune(units, r)
		i += size
	}
	return units
}

func utf16Len(s string) int { return len(utf16Units(s)) }

var (
	copyLetterRe   = regexp.MustCompile(`\p{L}`)
	copyUrlLikeRe  = regexp.MustCompile(asciiFold(`^(https?:|mailto:|tel:|data:|/|\.{1,2}/|#|@)`))
	copyOneWordRe  = regexp.MustCompile(`^\p{Lu}[\p{L}'’]+[.!?…:]*$`)
	copyCodeRe     = regexp.MustCompile(`[;{}]|=>|\bimport\b` + jsDot + `*\bfrom\b`)
	copyClassTok   = regexp.MustCompile(`^[a-z0-9_:/\[\]().%#,=-]+$`)
	copyClassPunct = regexp.MustCompile(`[-_:/\[\]=.\d]`)
)

func normalizeWhitespace(s string) string {
	return jsTrim(jsWhitespaceRun.ReplaceAllString(s, " "))
}

func contains(list []string, s string) bool {
	for _, item := range list {
		if item == s {
			return true
		}
	}
	return false
}

func everyToken(tokens []string, re *regexp.Regexp) bool {
	for _, t := range tokens {
		if !re.MatchString(t) {
			return false
		}
	}
	return true
}

func someToken(tokens []string, re *regexp.Regexp) bool {
	for _, t := range tokens {
		if re.MatchString(t) {
			return true
		}
	}
	return false
}

// looksLikeCopy ports looksLikeCopy of verify/source-checks.ts.
func looksLikeCopy(value string, allowed []string) bool {
	s := normalizeWhitespace(value)
	if s == "" || contains(allowed, s) || !copyLetterRe.MatchString(s) {
		return false
	}
	if copyUrlLikeRe.MatchString(s) {
		return false
	}
	if !strings.Contains(s, " ") {
		return copyOneWordRe.MatchString(s)
	}
	bare := strings.ReplaceAll(s, "{…}", "")
	if copyCodeRe.MatchString(bare) {
		return false
	}
	tokens := strings.Split(s, " ")
	if everyToken(tokens, copyClassTok) && someToken(tokens, copyClassPunct) {
		return false
	}
	return true
}

var (
	englishListRe     = regexp.MustCompile(`^[-*#>]` + ws)
	englishPathRe     = regexp.MustCompile(asciiFold(`^(https?:|mailto:|tel:|data:|file:|/|\.{1,2}/|#|@|~/|\$\{?[A-Za-z_]+\}?/)`))
	englishCodeRe     = regexp.MustCompile(`[;{}]|=>|===|\bimport\b` + jsDot + `*\bfrom\b|</?[a-z][^>]*>|\$\{[^}]*\}` + ws + `*\(`)
	englishSqlHeadRe  = regexp.MustCompile(asciiFold(`^(select|insert|update|delete|create|alter|drop|with|pragma|begin|commit|truncate)`) + ws)
	englishSqlBodyRe  = regexp.MustCompile(asciiFold(`\b(from|into|set|table|where|values|index|select|transaction)\b`))
	englishShellRe    = regexp.MustCompile(`^(git|npm|npx|pnpm|yarn|bun|node|tsc|pikku|cloud|docker|curl|cd|ls|rm|mkdir|cp|mv|chmod|sh|bash|echo|cat|grep|sed|awk|brew|apt|pip|python3?)` + ws + `+-?[\w./@:-]*`)
	englishShellFlag  = regexp.MustCompile(`(^|` + ws + `)-{1,2}[a-z]|` + ws + `[\w@./-]+/[\w./-]+`)
	englishCssRe      = regexp.MustCompile(`^[\d.\-+]+(px|rem|em|%|vh|vw|s|ms|fr)?` + ws)
	englishCssFuncRe  = regexp.MustCompile(`\b(calc|var|rgba?|hsla?|oklch|url|translate\w*|rotate|scale|linear-gradient|min|max|clamp)\(`)
	englishIdentTok   = regexp.MustCompile("^[a-z0-9_:/\\[\\]().%#,=@*&|<>+!'\"`~$^?\\\\-]+$")
	englishIdentPunct = regexp.MustCompile(`[-_:/\[\]=.\d@*&|<>+!~$^?\\()%#,]`)
	englishCamelTok   = regexp.MustCompile(`^[A-Za-z0-9_$]+$`)
	englishLowerStart = regexp.MustCompile(`^[a-z]`)
	englishHasUpper   = regexp.MustCompile(`[A-Z_]`)
	englishUpperStart = regexp.MustCompile(`^\p{Lu}`)
	sentenceEndRe     = regexp.MustCompile(`[.!?…:]$`)
)

// readsAsEnglish ports readsAsEnglish of verify/source-checks.ts.
func readsAsEnglish(text string) bool {
	s := normalizeWhitespace(text)
	if n := utf16Len(s); n < 5 || n > 200 || englishListRe.MatchString(s) || !copyLetterRe.MatchString(s) {
		return false
	}
	tokens := strings.Split(s, " ")
	wordTokens := 0
	for _, t := range tokens {
		if copyLetterRe.MatchString(t) {
			wordTokens++
		}
	}
	if wordTokens < 2 {
		return false
	}
	if englishPathRe.MatchString(s) || englishCodeRe.MatchString(s) {
		return false
	}
	if englishSqlHeadRe.MatchString(s) && englishSqlBodyRe.MatchString(s) {
		return false
	}
	if englishShellRe.MatchString(s) && !sentenceEndRe.MatchString(s) && len(tokens) > 1 && englishShellFlag.MatchString(s) {
		return false
	}
	if englishCssRe.MatchString(s) && !sentenceEndRe.MatchString(s) {
		return false
	}
	if englishCssFuncRe.MatchString(s) {
		return false
	}
	if everyToken(tokens, englishIdentTok) && someToken(tokens, englishIdentPunct) {
		return false
	}
	if everyToken(tokens, englishCamelTok) && allCamelTail(tokens) {
		return false
	}
	if !englishUpperStart.MatchString(s) && !sentenceEndRe.MatchString(s) && wordTokens < 3 {
		return false
	}
	return true
}

func allCamelTail(tokens []string) bool {
	for _, t := range tokens {
		if !englishLowerStart.MatchString(t) || !englishHasUpper.MatchString(t[1:]) {
			return false
		}
	}
	return true
}
