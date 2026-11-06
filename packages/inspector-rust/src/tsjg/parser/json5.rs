//! Port of Go `tsjg/parser/json5.go`.
//!
//! Known differences from Go: `char::is_alphabetic` / `char::is_numeric` stand
//! in for `unicode.IsLetter` / `unicode.IsDigit` (a superset for a few exotic
//! characters); non-finite numbers become JSON null (serde_json cannot hold
//! them), which is what the schema marshaller writes for them anyway.

use serde_json::{Map, Value};

/// Parses a JSON5-subset document: JSON values, single-quoted strings,
/// unquoted object keys, trailing commas, Infinity/-Infinity/NaN, hex numbers,
/// and comments. Numbers are returned as f64.
pub fn parse_json5(s: &str) -> Result<Value, String> {
    let mut p = Parser { input: s, pos: 0 };
    p.skip_ignored()?;
    let value = p.parse_value()?;
    p.skip_ignored()?;
    if p.pos < p.input.len() {
        return Err(p.errorf(&format!("unexpected character {:?} after value", p.peek_rune())));
    }
    Ok(value)
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

fn num(f: f64) -> Value {
    Value::from(f)
}

impl<'a> Parser<'a> {
    fn errorf(&self, msg: &str) -> String {
        format!("JSON5 parse error at position {}: {}", self.pos, msg)
    }

    fn byte(&self) -> u8 {
        self.input.as_bytes()[self.pos]
    }

    fn rest(&self) -> &'a str {
        &self.input[self.pos..]
    }

    fn peek_rune(&self) -> char {
        self.rest().chars().next().unwrap_or('\u{FFFD}')
    }

    /// Skips whitespace and comments.
    fn skip_ignored(&mut self) -> Result<(), String> {
        while self.pos < self.input.len() {
            let r = self.peek_rune();
            let bytes = self.input.as_bytes();
            if r.is_whitespace() || r == '\u{FEFF}' {
                self.pos += r.len_utf8();
            } else if r == '/' && self.pos + 1 < bytes.len() && bytes[self.pos + 1] == b'/' {
                while self.pos < bytes.len() && bytes[self.pos] != b'\n' && bytes[self.pos] != b'\r' {
                    self.pos += 1;
                }
            } else if r == '/' && self.pos + 1 < bytes.len() && bytes[self.pos + 1] == b'*' {
                match self.input[self.pos + 2..].find("*/") {
                    None => {
                        self.pos = self.input.len();
                        return Err(self.errorf("unterminated comment"));
                    }
                    Some(end) => self.pos += 2 + end + 2,
                }
            } else {
                return Ok(());
            }
        }
        Ok(())
    }

    fn parse_value(&mut self) -> Result<Value, String> {
        if self.pos >= self.input.len() {
            return Err(self.errorf("unexpected end of input"));
        }
        match self.byte() {
            b'{' => self.parse_object(),
            b'[' => self.parse_array(),
            b'"' | b'\'' => self.parse_string().map(Value::String),
            c if c == b'+' || c == b'-' || c == b'.' || c.is_ascii_digit() => self.parse_number(),
            _ => self.parse_literal_name(),
        }
    }

    fn parse_literal_name(&mut self) -> Result<Value, String> {
        let name = self.scan_identifier();
        match name {
            "null" => Ok(Value::Null),
            "true" => Ok(Value::Bool(true)),
            "false" => Ok(Value::Bool(false)),
            "Infinity" => Ok(num(f64::INFINITY)),
            "NaN" => Ok(num(f64::NAN)),
            "" => Err(self.errorf(&format!("unexpected character {:?}", self.peek_rune()))),
            _ => Err(self.errorf(&format!("unexpected literal {:?}", name))),
        }
    }

    /// Consumes an ECMAScript-style identifier name.
    fn scan_identifier(&mut self) -> &'a str {
        let start = self.pos;
        while self.pos < self.input.len() {
            let r = self.peek_rune();
            let is_start = r.is_alphabetic() || r == '$' || r == '_';
            if !is_start && !(self.pos > start && (r.is_numeric() || r == '\u{200C}' || r == '\u{200D}')) {
                break;
            }
            self.pos += r.len_utf8();
        }
        &self.input[start..self.pos]
    }

    fn parse_object(&mut self) -> Result<Value, String> {
        self.pos += 1; // consume '{'
        let mut result = Map::new();
        loop {
            self.skip_ignored()?;
            if self.pos >= self.input.len() {
                return Err(self.errorf("unterminated object"));
            }
            if self.byte() == b'}' {
                self.pos += 1;
                return Ok(Value::Object(result));
            }
            let key = self.parse_object_key()?;
            self.skip_ignored()?;
            if self.pos >= self.input.len() || self.byte() != b':' {
                return Err(self.errorf(&format!("expected ':' after object key {:?}", key)));
            }
            self.pos += 1;
            self.skip_ignored()?;
            let value = self.parse_value()?;
            result.insert(key, value);

            self.skip_ignored()?;
            if self.pos >= self.input.len() {
                return Err(self.errorf("unterminated object"));
            }
            match self.byte() {
                b',' => self.pos += 1, // trailing commas are handled by the '}' check above
                b'}' => {
                    self.pos += 1;
                    return Ok(Value::Object(result));
                }
                _ => return Err(self.errorf(&format!("expected ',' or '}}' in object, got {:?}", self.peek_rune()))),
            }
        }
    }

    fn parse_object_key(&mut self) -> Result<String, String> {
        let c = self.byte();
        if c == b'"' || c == b'\'' {
            return self.parse_string();
        }
        let key = self.scan_identifier();
        if !key.is_empty() {
            return Ok(key.to_string());
        }
        Err(self.errorf(&format!("invalid object key starting with {:?}", self.peek_rune())))
    }

    fn parse_array(&mut self) -> Result<Value, String> {
        self.pos += 1; // consume '['
        let mut result = Vec::new();
        loop {
            self.skip_ignored()?;
            if self.pos >= self.input.len() {
                return Err(self.errorf("unterminated array"));
            }
            if self.byte() == b']' {
                self.pos += 1;
                return Ok(Value::Array(result));
            }
            result.push(self.parse_value()?);
            self.skip_ignored()?;
            if self.pos >= self.input.len() {
                return Err(self.errorf("unterminated array"));
            }
            match self.byte() {
                b',' => self.pos += 1,
                b']' => {
                    self.pos += 1;
                    return Ok(Value::Array(result));
                }
                _ => return Err(self.errorf(&format!("expected ',' or ']' in array, got {:?}", self.peek_rune()))),
            }
        }
    }

    fn parse_string(&mut self) -> Result<String, String> {
        let quote = self.byte();
        self.pos += 1;
        let mut sb = String::new();
        while self.pos < self.input.len() {
            let r = self.peek_rune();
            if r.is_ascii() && r as u8 == quote {
                self.pos += 1;
                return Ok(sb);
            } else if r == '\n' || r == '\r' || r == '\u{2028}' || r == '\u{2029}' {
                return Err(self.errorf("unescaped line terminator in string"));
            } else if r == '\\' {
                self.pos += 1;
                self.parse_escape(&mut sb)?;
            } else {
                sb.push(r);
                self.pos += r.len_utf8();
            }
        }
        Err(self.errorf("unterminated string"))
    }

    fn parse_escape(&mut self, sb: &mut String) -> Result<(), String> {
        if self.pos >= self.input.len() {
            return Err(self.errorf("unterminated escape sequence"));
        }
        let r = self.peek_rune();
        let size = r.len_utf8();
        match r {
            'b' => sb.push('\u{8}'),
            'f' => sb.push('\u{c}'),
            'n' => sb.push('\n'),
            'r' => sb.push('\r'),
            't' => sb.push('\t'),
            'v' => sb.push('\u{b}'),
            '0' => sb.push('\0'),
            'x' => return self.parse_hex_escape(sb, 2),
            'u' => return self.parse_hex_escape(sb, 4),
            '\n' | '\u{2028}' | '\u{2029}' => {} // Line continuation: the newline is dropped.
            '\r' => {
                // Line continuation; \r\n counts as a single line terminator.
                if self.pos + 1 < self.input.len() && self.input.as_bytes()[self.pos + 1] == b'\n' {
                    self.pos += 1;
                }
            }
            _ => sb.push(r),
        }
        self.pos += size;
        Ok(())
    }

    fn parse_hex_escape(&mut self, sb: &mut String, digits: usize) -> Result<(), String> {
        self.pos += 1; // consume 'x' or 'u'
        let code = self.read_hex_digits(digits)?;
        // A \uXXXX high surrogate followed by a \uXXXX low surrogate is one
        // character, as in JS. A lone surrogate falls through and, having no
        // UTF-8 encoding, becomes U+FFFD.
        if digits == 4 && (0xD800..=0xDBFF).contains(&code) && self.rest().starts_with("\\u") {
            let mark = self.pos;
            self.pos += 2;
            if let Ok(low) = self.read_hex_digits(4) {
                if (0xDC00..=0xDFFF).contains(&low) {
                    sb.push(char::from_u32(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)).unwrap_or('\u{FFFD}'));
                    return Ok(());
                }
            }
            self.pos = mark;
        }
        sb.push(char::from_u32(code).unwrap_or('\u{FFFD}'));
        Ok(())
    }

    fn read_hex_digits(&mut self, digits: usize) -> Result<u32, String> {
        if self.pos + digits > self.input.len() {
            return Err(self.errorf("unterminated hex escape"));
        }
        let Some(text) = self.input.get(self.pos..self.pos + digits) else {
            return Err(self.errorf("invalid hex escape"));
        };
        // strconv.ParseUint accepts no sign.
        if !text.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(self.errorf(&format!("invalid hex escape {:?}", text)));
        }
        let code = u32::from_str_radix(text, 16).map_err(|_| self.errorf(&format!("invalid hex escape {:?}", text)))?;
        self.pos += digits;
        Ok(code)
    }

    fn parse_number(&mut self) -> Result<Value, String> {
        let start = self.pos;
        let mut sign = 1.0;
        let c = self.byte();
        if c == b'+' || c == b'-' {
            if c == b'-' {
                sign = -1.0;
            }
            self.pos += 1;
            if self.pos >= self.input.len() {
                return Err(self.errorf(&format!("invalid number {:?}", &self.input[start..])));
            }
        }
        if self.rest().starts_with("Infinity") {
            self.pos += "Infinity".len();
            return Ok(num(sign * f64::INFINITY));
        }
        if self.rest().starts_with("NaN") {
            self.pos += "NaN".len();
            return Ok(num(f64::NAN));
        }
        if self.rest().starts_with("0x") || self.rest().starts_with("0X") {
            self.pos += 2;
            let digits_start = self.pos;
            while self.pos < self.input.len() && self.byte().is_ascii_hexdigit() {
                self.pos += 1;
            }
            if self.pos == digits_start {
                return Err(self.errorf(&format!("invalid hex number {:?}", &self.input[start..self.pos])));
            }
            let value = u64::from_str_radix(&self.input[digits_start..self.pos], 16)
                .map_err(|e| self.errorf(&format!("invalid hex number {:?}: {}", &self.input[start..self.pos], e)))?;
            return Ok(num(sign * value as f64));
        }
        let num_start = self.pos;
        while self.pos < self.input.len() && is_decimal_number_char(self.byte()) {
            self.pos += 1;
        }
        let literal = &self.input[num_start..self.pos];
        if literal.is_empty() {
            return Err(self.errorf(&format!("invalid number {:?}", &self.input[start..self.pos])));
        }
        // strconv.ParseFloat reports a range error for values that overflow.
        match literal.parse::<f64>() {
            Ok(v) if v.is_finite() => Ok(num(sign * v)),
            _ => Err(self.errorf(&format!("invalid number {:?}", &self.input[start..self.pos]))),
        }
    }
}

fn is_decimal_number_char(c: u8) -> bool {
    c.is_ascii_digit() || c == b'.' || c == b'e' || c == b'E' || c == b'+' || c == b'-'
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_json5_subset() {
        assert_eq!(parse_json5("{a: 1, 'b': [1, 2,], c: 'x\\n',}").unwrap(), json!({"a": 1.0, "b": [1.0, 2.0], "c": "x\n"}));
        assert_eq!(parse_json5("// c\n 0x10").unwrap(), json!(16.0));
        assert_eq!(parse_json5("-1.5e1").unwrap(), json!(-15.0));
        assert_eq!(parse_json5("null").unwrap(), Value::Null);
        assert_eq!(parse_json5("\"\\ud83d\\ude00\"").unwrap(), json!("😀"));
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_json5("foo").is_err());
        assert!(parse_json5("{a:1").is_err());
        assert!(parse_json5("1 2").is_err());
        assert!(parse_json5("1e999").is_err());
    }
}
