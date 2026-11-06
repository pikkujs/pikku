//! Port of Go `tsutil/types.go`.

use tsrs_ast::Symbol;
use tsrs_checker::{Type, TypeFlags};
use tsrs_core::P;

/// `NullifyType`: the type names that stand for "nothing" become "".
pub fn nullify_type(name: &str) -> &str {
    match name {
        "void" | "undefined" | "unknown" | "any" | "null" => "",
        _ => name,
    }
}

/// `PrimitiveFlags`.
pub fn primitive_flags() -> TypeFlags {
    TypeFlags::Number
        | TypeFlags::String
        | TypeFlags::Boolean
        | TypeFlags::BigInt
        | TypeFlags::ESSymbol
        | TypeFlags::Void
        | TypeFlags::Undefined
        | TypeFlags::Null
        | TypeFlags::Unknown
        | TypeFlags::VoidLike
}

/// `IsPrimitive`.
pub fn is_primitive(t: P<Type>) -> bool {
    t.flags().intersects(primitive_flags())
}

/// `IsLibFile`: typescript-go serves its lib files from `bundled:///libs/...`.
pub fn is_lib_file(path: &str) -> bool {
    path.contains("node_modules/typescript") || path.starts_with("bundled:")
}

/// `IsVoidLikeType`.
pub fn is_void_like_type(t: P<Type>) -> bool {
    t.flags().intersects(TypeFlags::Void | TypeFlags::Undefined | TypeFlags::VoidLike)
}

/// `SymbolName`: spells internal symbol names the way Strada does. typescript-go
/// marks them with the byte 0xFE (`"\xFEobject"`), TS with a `__` prefix. tsrs
/// cannot hold that byte in a `&str`; its marker is U+007F
/// (`tsrs_ast::INTERNAL_SYMBOL_NAME_PREFIX`).
pub fn symbol_name(sym: P<Symbol>) -> String {
    let name = sym.name();
    match name.strip_prefix(tsrs_ast::INTERNAL_SYMBOL_NAME_PREFIX) {
        Some(rest) => format!("__{rest}"),
        None => name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nullify() {
        assert_eq!(nullify_type("void"), "");
        assert_eq!(nullify_type("Foo"), "Foo");
    }

    #[test]
    fn lib_files() {
        assert!(is_lib_file("bundled:///libs/lib.d.ts"));
        assert!(is_lib_file("/x/node_modules/typescript/lib/lib.d.ts"));
        assert!(!is_lib_file("/x/src/a.ts"));
    }
}
