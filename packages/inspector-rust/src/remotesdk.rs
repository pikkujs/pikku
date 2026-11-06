//! Port of Go `internal/remotesdk` (utils/remote-addon-sdk.ts): the versioned
//! wireRemoteAddon package spec, pikku-addons.lock and the SDKs `pikku all`
//! extracts under .pikku/remote.

use std::collections::HashMap;
use std::path::Path;

pub const LOCK_FILE: &str = "pikku-addons.lock";
pub const INTEGRITY_MARKER: &str = ".integrity";
/// REMOTE_SDK_DIR, relative to the project root.
pub const SDK_ROOT: &str = ".pikku/remote";

/// `parseRemoteAddonPackage`: split at the last '@' after the first character.
/// The range is empty when the spec names only the package.
pub fn parse_package(spec: &str) -> Result<(String, String), String> {
    let trimmed = spec.trim_matches(|c: char| c.is_whitespace());
    match trimmed.rfind('@') {
        Some(at) if at > 0 => {
            let name = &trimmed[..at];
            let rng = trimmed[at + 1..].trim_matches(|c: char| c.is_whitespace());
            if rng.is_empty() {
                return Err(format!(
                    "'{spec}' ends in '@' with no version range after it. Write '{name}@^1.0.0', or drop the '@'."
                ));
            }
            Ok((name.to_string(), rng.to_string()))
        }
        _ => {
            if trimmed.is_empty() || trimmed == "@" {
                return Err(format!("'{spec}' is not a package name"));
            }
            Ok((trimmed.to_string(), String::new()))
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct LockEntry {
    pub range: String,
    pub version: String,
    pub integrity: String,
}

#[derive(Clone, Debug, Default)]
pub struct Lock {
    pub sdks: HashMap<String, LockEntry>,
}

/// `readAddonsLock`: an empty lock when the file is absent.
pub fn read_lock(root_dir: &str) -> Result<Lock, String> {
    let path = format!("{}/{}", root_dir.trim_end_matches('/'), LOCK_FILE);
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Lock::default()),
        Err(e) => return Err(e.to_string()),
    };
    let v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| format!("{path} is not valid JSON: {e}"))?;
    let Some(sdks) = v.get("sdks").and_then(|s| s.as_object()) else {
        return Err(format!("{path} has no \"sdks\" object"));
    };
    let s = |e: &serde_json::Value, k: &str| e.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    Ok(Lock {
        sdks: sdks
            .iter()
            .map(|(k, e)| (k.clone(), LockEntry { range: s(e, "range"), version: s(e, "version"), integrity: s(e, "integrity") }))
            .collect(),
    })
}

pub fn dir(root_dir: &str, name: &str, version: &str) -> String {
    format!("{}/{SDK_ROOT}/{name}@{version}", root_dir.trim_end_matches('/'))
}

/// `checkLockedSdk`: the SDK directory when the SDK on disk is the one the lock
/// pins for this range, else the reason it is not.
pub fn check(root_dir: &str, name: &str, rng: &str, lock: &Lock) -> Result<String, String> {
    let Some(entry) = lock.sdks.get(name) else {
        return Err(format!("{LOCK_FILE} has no entry for it"));
    };
    if entry.range != rng {
        return Err(format!("{LOCK_FILE} was resolved for '{}', not '{rng}'", entry.range));
    }
    let d = dir(root_dir, name, &entry.version);
    let Ok(marker) = std::fs::read_to_string(Path::new(&d).join(INTEGRITY_MARKER)) else {
        return Err(format!("{d} is missing"));
    };
    if marker.trim() != entry.integrity {
        return Err(format!("{d} was extracted from a different tarball than {LOCK_FILE} pins"));
    }
    let manifest: Option<serde_json::Value> =
        std::fs::read(Path::new(&d).join("manifest.json")).ok().and_then(|b| serde_json::from_slice(&b).ok());
    let ok = manifest.as_ref().is_some_and(|m| {
        m.get("name").and_then(|x| x.as_str()) == Some(name) && m.get("version").and_then(|x| x.as_str()) == Some(&entry.version)
    });
    if !ok {
        return Err(format!("{d}/manifest.json does not name {name}@{}", entry.version));
    }
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_package_specs() {
        assert_eq!(parse_package("@scope/a@^1.0.0").unwrap(), ("@scope/a".into(), "^1.0.0".into()));
        assert_eq!(parse_package("@scope/a").unwrap(), ("@scope/a".into(), String::new()));
        assert_eq!(parse_package(" a@1 ").unwrap(), ("a".into(), "1".into()));
        assert!(parse_package("a@").unwrap_err().contains("ends in '@'"));
        assert!(parse_package("").is_err());
        assert!(parse_package("@").is_err());
    }

    #[test]
    fn check_matches_the_lock() {
        let root = std::env::temp_dir().join(format!("pikku-rs-remotesdk-{}", std::process::id()));
        let root_s = root.to_string_lossy().into_owned();
        let name = "@pikkustudio/addon-cloud-api";
        let write = |path: &Path, body: &str| {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, body).unwrap();
        };
        write(
            &root.join(LOCK_FILE),
            &format!(r#"{{"lockfileVersion":1,"sdks":{{"{name}":{{"range":"^1.4.0","version":"1.4.2","integrity":"sha512-AAAA"}}}}}}"#),
        );
        let d = dir(&root_s, name, "1.4.2");
        write(&Path::new(&d).join("manifest.json"), &format!(r#"{{"name":"{name}","version":"1.4.2"}}"#));
        let lock = read_lock(&root_s).unwrap();
        assert!(check(&root_s, name, "^1.4.0", &lock).is_err(), "no integrity marker");
        write(&Path::new(&d).join(INTEGRITY_MARKER), "sha512-AAAA");
        assert_eq!(check(&root_s, name, "^1.4.0", &lock).unwrap(), d);
        assert!(check(&root_s, name, "^1.6.0", &lock).is_err(), "range the lock was not written for");
        write(&Path::new(&d).join(INTEGRITY_MARKER), "sha512-BBBB");
        assert!(check(&root_s, name, "^1.4.0", &lock).is_err(), "different tarball");
        std::fs::remove_dir_all(&root).unwrap();
    }
}
