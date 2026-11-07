//! Port of Go `internal/jsjson`: JSON encoding byte-compatible with
//! JavaScript's `JSON.stringify`.
//!
//! serde_json already escapes the same characters `JSON.stringify` does (the
//! short forms `\b \f \n \r \t`, lowercase `\u00xx` for the other controls,
//! no escaping of `<>&` or U+2028/9). The one difference is the number
//! format: serde_json prints `1e21` and `1.2345678901234568e20` where
//! JavaScript prints `1e+21` and `123456789012345680000`. [`JsFormatter`]
//! overrides `write_f64` with the ECMAScript `Number::toString` algorithm.

use serde::Serialize;
use serde_json::ser::{CompactFormatter, Formatter, PrettyFormatter, Serializer};
use std::io;

/// ECMAScript `Number::toString(x)` for a finite `x`; `null` otherwise, as
/// `JSON.stringify` writes NaN and the infinities.
pub fn format_number(x: f64) -> String {
    if !x.is_finite() {
        return "null".to_string();
    }
    if x == 0.0 {
        return "0".to_string();
    }
    let sign = if x < 0.0 { "-" } else { "" };
    // `{:e}` gives the shortest round-trip digits: "d.ddde<exp>".
    let sci = format!("{:e}", x.abs());
    let (mantissa, exp) = sci.split_once('e').expect("exponent form");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp.parse::<i32>().expect("exponent") + 1; // value = 0.digits * 10^n
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let e = n - 1;
        let es = if e < 0 { format!("-{}", -e) } else { format!("+{e}") };
        if k == 1 {
            format!("{digits}e{es}")
        } else {
            format!("{}.{}e{es}", &digits[..1], &digits[1..])
        }
    };
    format!("{sign}{body}")
}

/// A formatter that wraps another and writes numbers the JavaScript way.
pub struct JsFormatter<F: Formatter>(F);

impl<F: Formatter> Formatter for JsFormatter<F> {
    fn write_f64<W: ?Sized + io::Write>(&mut self, w: &mut W, value: f64) -> io::Result<()> {
        w.write_all(format_number(value).as_bytes())
    }
    fn write_f32<W: ?Sized + io::Write>(&mut self, w: &mut W, value: f32) -> io::Result<()> {
        let widened: f64 = value.to_string().parse().unwrap_or(value as f64);
        w.write_all(format_number(widened).as_bytes())
    }
    fn begin_array<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.begin_array(w)
    }
    fn end_array<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_array(w)
    }
    fn begin_array_value<W: ?Sized + io::Write>(&mut self, w: &mut W, first: bool) -> io::Result<()> {
        self.0.begin_array_value(w, first)
    }
    fn end_array_value<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_array_value(w)
    }
    fn begin_object<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.begin_object(w)
    }
    fn end_object<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_object(w)
    }
    fn begin_object_key<W: ?Sized + io::Write>(&mut self, w: &mut W, first: bool) -> io::Result<()> {
        self.0.begin_object_key(w, first)
    }
    fn end_object_key<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_object_key(w)
    }
    fn begin_object_value<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.begin_object_value(w)
    }
    fn end_object_value<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_object_value(w)
    }
}

/// `JSON.stringify(v, null, indent)`; an empty `indent` gives the compact form.
/// Go's `jsjson.Marshal`.
pub fn marshal<T: Serialize + ?Sized>(v: &T, indent: &str) -> Result<Vec<u8>, serde_json::Error> {
    let mut out = Vec::new();
    if indent.is_empty() {
        let mut ser = Serializer::with_formatter(&mut out, JsFormatter(CompactFormatter));
        v.serialize(&mut ser)?;
    } else {
        let mut ser =
            Serializer::with_formatter(&mut out, JsFormatter(PrettyFormatter::with_indent(indent.as_bytes())));
        v.serialize(&mut ser)?;
    }
    Ok(out)
}

/// Compact [`marshal`] as a `String`. Go's `jsjson.MustMarshal`; the Rust
/// version returns the error instead of panicking.
pub fn to_string<T: Serialize + ?Sized>(v: &T) -> Result<String, serde_json::Error> {
    marshal(v, "").map(|b| String::from_utf8(b).expect("serde_json writes UTF-8"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Expected strings are JSON.stringify output from node (the same cases as
    // Go's jsjson_test.go).
    #[test]
    fn matches_json_stringify() {
        let tenth = 0.1_f64;
        let cases: Vec<(serde_json::Value, &str)> = vec![
            (json!("<a&b>"), r#""<a&b>""#),
            (json!("\u{2028}\u{2029}"), "\"\u{2028}\u{2029}\""),
            (json!("\u{8}\u{c}\n\r\t\u{0}\u{1f}\"\\"), r#""\b\f\n\r\t\u0000\u001f\"\\""#),
            (json!("é😀"), r#""é😀""#),
            (json!(1e21), "1e+21"),
            (json!(1.5e-7), "1.5e-7"),
            (json!(123456789012345680000.0), "123456789012345680000"),
            (json!(tenth + 2.0 * tenth), "0.30000000000000004"),
            (json!({"a": []}), r#"{"a":[]}"#),
        ];
        for (v, want) in cases {
            assert_eq!(to_string(&v).unwrap(), want, "{v:?}");
        }
    }

    #[test]
    fn number_edges() {
        for (x, want) in [
            (0.0, "0"),
            (-0.0, "0"),
            (1.0, "1"),
            (-1.5, "-1.5"),
            (100.0, "100"),
            (1e-6, "0.000001"),
            (1e-7, "1e-7"),
            (1.2345e-7, "1.2345e-7"),
            (1e20, "100000000000000000000"),
            (1.5e300, "1.5e+300"),
            (0.5, "0.5"),
            (f64::NAN, "null"),
            (f64::INFINITY, "null"),
        ] {
            assert_eq!(format_number(x), want);
        }
    }

    #[test]
    fn keeps_key_order_and_indent() {
        let v: serde_json::Value = serde_json::from_str(r#"{"b":1,"a":[1],"c":{},"d":[]}"#).unwrap();
        assert_eq!(to_string(&v).unwrap(), r#"{"b":1,"a":[1],"c":{},"d":[]}"#);
        let got = marshal(&json!({"a": [1]}), "  ").unwrap();
        assert_eq!(String::from_utf8(got).unwrap(), "{\n  \"a\": [\n    1\n  ]\n}");
    }
}
