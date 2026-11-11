package sourcescan

// JSWhitespace is the character class of JavaScript's \s, for use inside a
// regexp bracket expression.
const JSWhitespace = jsWhitespace

// JSTrim is String.prototype.trim.
func JSTrim(s string) string { return jsTrim(s) }
