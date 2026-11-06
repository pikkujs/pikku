//! Small helpers shared by the finalize steps (Go `finalize/raw.go` and the
//! string helpers scattered through its files).

use std::path::{Path, PathBuf};

/// `list.join(', ') || 'none'`.
pub fn or_none(list: &[String]) -> String {
    let joined = list.join(", ");
    if joined.is_empty() { "none".to_string() } else { joined }
}

pub fn quote_each(list: &[String]) -> Vec<String> {
    list.iter().map(|s| format!("'{s}'")).collect()
}

/// `kebab` as post-process.ts toKebab: `([a-z0-9])([A-Z])` -> `$1-$2`, then
/// `([A-Z])([A-Z][a-z])` -> `$1-$2`, lower-cased.
pub fn to_kebab(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if i + 1 < c.len() && (c[i].is_ascii_lowercase() || c[i].is_ascii_digit()) && c[i + 1].is_ascii_uppercase() {
            out.push(c[i]);
            out.push('-');
            out.push(c[i + 1]);
            i += 2;
        } else {
            out.push(c[i]);
            i += 1;
        }
    }
    let c: Vec<char> = out.chars().collect();
    let mut out2 = String::new();
    let mut i = 0;
    while i < c.len() {
        if i + 2 < c.len() && c[i].is_ascii_uppercase() && c[i + 1].is_ascii_uppercase() && c[i + 2].is_ascii_lowercase() {
            out2.push(c[i]);
            out2.push('-');
            out2.push(c[i + 1]);
            out2.push(c[i + 2]);
            i += 3;
        } else {
            out2.push(c[i]);
            i += 1;
        }
    }
    out2.to_lowercase()
}

/// Go `filepath.Clean` for a Unix path.
pub fn clean(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let rooted = p.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|l| *l != "..") {
                    parts.pop();
                } else if !rooted {
                    parts.push("..");
                }
            }
            s => parts.push(s),
        }
    }
    let joined = parts.join("/");
    match (rooted, joined.is_empty()) {
        (true, _) => format!("/{joined}"),
        (false, true) => ".".into(),
        (false, false) => joined,
    }
}

/// node's `path.relative` for two absolute paths (Go `filepath.Rel`; `""` when
/// equal; `to` when a relative path cannot be made).
pub fn js_relative(from: &str, to: &str) -> String {
    let (f, t) = (clean(from), clean(to));
    if f.starts_with('/') != t.starts_with('/') {
        return to.to_string();
    }
    if f == t {
        return String::new();
    }
    let fs: Vec<&str> = f.split('/').filter(|s| !s.is_empty()).collect();
    let ts: Vec<&str> = t.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < fs.len() && i < ts.len() && fs[i] == ts[i] {
        i += 1;
    }
    let mut out: Vec<&str> = vec![".."; fs.len() - i];
    out.extend(&ts[i..]);
    out.join("/")
}

pub fn path_join(parts: &[&str]) -> String {
    let joined: Vec<&str> = parts.iter().filter(|p| !p.is_empty()).copied().collect();
    if joined.is_empty() {
        return String::new();
    }
    clean(&joined.join("/"))
}

pub fn dir_of(p: &str) -> String {
    let c = clean(p);
    match c.rfind('/') {
        Some(0) => "/".into(),
        Some(i) => c[..i].to_string(),
        None => ".".into(),
    }
}

pub fn base_of(p: &str) -> String {
    let c = clean(p);
    if c == "/" {
        return "/".into();
    }
    c.rsplit('/').next().unwrap_or("").to_string()
}

/// `filepath.Abs`.
pub fn abs(p: &str) -> String {
    if p.starts_with('/') {
        return clean(p);
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    clean(&format!("{}/{p}", cwd.display()))
}

pub fn file_exists(p: &str) -> bool {
    Path::new(p).is_file()
}

pub fn dir_exists(p: &str) -> bool {
    Path::new(p).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kebab() {
        assert_eq!(to_kebab("myWorkflowName"), "my-workflow-name");
        assert_eq!(to_kebab("HTTPServer"), "http-server");
        assert_eq!(to_kebab("aBC"), "a-bc");
        assert_eq!(to_kebab("sendEmail2Fast"), "send-email2-fast");
    }

    #[test]
    fn relative() {
        assert_eq!(js_relative("/a/b", "/a/b/c/d.ts"), "c/d.ts");
        assert_eq!(js_relative("/a/b", "/a/x.ts"), "../x.ts");
        assert_eq!(js_relative("/a", "/a"), "");
    }

    #[test]
    fn cleaning() {
        assert_eq!(clean("/a/./b/../c//"), "/a/c");
        assert_eq!(dir_of("/a/b"), "/a");
        assert_eq!(dir_of("/a"), "/");
    }
}
