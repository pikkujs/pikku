package schemas

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

// Port of utils/custom-types-generator.ts: the source of the virtual file the
// schema program is rooted at.

var (
	undefinedGeneric  = regexp.MustCompile(`\b(Name|In|Out|Key)\b`)
	bracketed         = regexp.MustCompile(`\[.*\]`)
	capitalisedIdent  = regexp.MustCompile(`\b[A-Z][a-zA-Z0-9]*\b`)
	utilityTypeNames  = map[string]bool{"Pick": true, "Omit": true, "Partial": true, "Required": true, "Record": true, "Readonly": true}
	classificationTag = map[string]bool{"Private": true, "Pii": true, "Secret": true}
)

// SanitizeTypeName is sanitizeTypeName. The TS regex has no u flag, so a
// character outside the BMP is two code units and becomes two underscores.
func SanitizeTypeName(name string) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r < utf8.RuneSelf && isIdentPart(byte(r)):
			b.WriteRune(r)
		case r > 0xFFFF:
			b.WriteString("__")
		default:
			b.WriteByte('_')
		}
	}
	s := b.String()
	if s != "" && s[0] >= '0' && s[0] <= '9' {
		return "_" + s
	}
	return s
}

func isIdentStart(c byte) bool {
	return c == '_' || c == '$' || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
}

func isIdentPart(c byte) bool { return isIdentStart(c) || (c >= '0' && c <= '9') }

// The TS walks UTF-16 code units; walking bytes is equivalent here because
// every byte it acts on is ASCII and every other byte is copied through.
func findMatchingAngleBracket(typ string, start int) int {
	depth := 0
	for i := start; i < len(typ); i++ {
		switch {
		case typ[i] == '<':
			depth++
		case typ[i] == '>' && (i == 0 || typ[i-1] != '='):
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

func stripClassificationWrappers(typ string) string {
	var out strings.Builder
	for i := 0; i < len(typ); {
		if !isIdentStart(typ[i]) {
			out.WriteByte(typ[i])
			i++
			continue
		}
		end := i + 1
		for end < len(typ) && isIdentPart(typ[end]) {
			end++
		}
		ident := typ[i:end]
		if classificationTag[ident] && end < len(typ) && typ[end] == '<' {
			if closing := findMatchingAngleBracket(typ, end); closing != -1 {
				out.WriteString(stripClassificationWrappers(typ[end+1 : closing]))
				i = closing + 1
				continue
			}
		}
		out.WriteString(ident)
		i = end
	}
	return out.String()
}

// orderedSet is a JS Set of strings.
type orderedSet struct {
	items []string
	seen  map[string]bool
}

func (s *orderedSet) add(v string) {
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	if !s.seen[v] {
		s.seen[v] = true
		s.items = append(s.items, v)
	}
}

func (s *orderedSet) has(v string) bool { return s.seen[v] }

// localeCompare stands in for String.prototype.localeCompare under Node's
// default ICU locale. Only declaration order in the virtual file depends on
// it, never a schema.
func localeSort(names []string) {
	c := collate.New(language.English)
	sort.SliceStable(names, func(i, j int) bool { return c.CompareString(names[i], names[j]) < 0 })
}

// GenerateCustomTypes is generateCustomTypes. It returns the virtual file's
// source and the names it imports (the TS requiredTypes out-parameter).
func GenerateCustomTypes(tm *typesmap.TypesMap) (string, []string) {
	var required orderedSet
	names := tm.CustomTypeKeys()
	localeSort(names)

	var decls []string
	for _, originalName := range names {
		ct, _ := tm.CustomType(originalName)
		if undefinedGeneric.MatchString(ct.Type) && bracketed.MatchString(ct.Type) {
			continue
		}
		name := SanitizeTypeName(originalName)
		for _, ref := range ct.References {
			if ref != "__object" && !strings.HasPrefix(ref, "__object_") && !classificationTag[ref] {
				required.add(ref)
			}
		}

		typeString := stripClassificationWrappers(ct.Type)
		for _, typeName := range capitalisedIdent.FindAllString(typeString, -1) {
			if strings.Contains(typeString, `"`+typeName+`"`) || utilityTypeNames[typeName] {
				continue
			}
			if meta, err := tm.GetTypeMeta(typeName); err == nil && meta.Path != nil && *meta.Path != "" {
				required.add(meta.OriginalName)
			}
		}

		if name == typeString {
			continue
		}
		decls = append(decls, "export type "+name+" = "+typeString)
	}

	var paths []string
	importsByPath := map[string]*orderedSet{}
	for _, typeName := range required.items {
		if classificationTag[typeName] {
			continue
		}
		meta, err := tm.GetTypeMeta(typeName)
		if err != nil || meta.Path == nil || *meta.Path == "" {
			continue
		}
		set := importsByPath[*meta.Path]
		if set == nil {
			set = &orderedSet{}
			importsByPath[*meta.Path] = set
			paths = append(paths, *meta.Path)
		}
		set.add(meta.OriginalName)
	}

	imports := make([]string, len(paths))
	for i, p := range paths {
		imports[i] = "import type { " + strings.Join(importsByPath[p].items, ", ") + " } from '" + p + "'"
	}
	return strings.Join(imports, "\n") + "\n\n" + strings.Join(decls, "\n"), required.items
}
