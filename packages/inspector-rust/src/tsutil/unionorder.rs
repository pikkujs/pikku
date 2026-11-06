//! STUB of Go `tsutil/unionorder.go`, owned by another porter: they replace
//! this file wholesale on merge. Only what `visit` needs today.

use tsrs_ast::Node;
use tsrs_checker::{Checker, Type, TypeFormatFlags};
use tsrs_core::P;

/// Go `TypeToString`: `checker.typeToString(t)` with the given flags and
/// Strada's union/property order. STUB: tsrs's own order, no reorder.
pub fn type_to_string(c: &mut Checker, t: P<Type>, flags: TypeFormatFlags) -> String {
    c.type_to_string_ex_exported(t, None, flags, None)
}

/// Go `TypeToStringAt`. STUB: ignores `enclosing`'s reorder.
pub fn type_to_string_at(c: &mut Checker, t: P<Type>, enclosing: Option<P<Node>>, flags: TypeFormatFlags) -> String {
    c.type_to_string_ex_exported(t, enclosing, flags, None)
}
