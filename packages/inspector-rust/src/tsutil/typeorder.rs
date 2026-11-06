//! STUB of Go `tsutil/typeorder.go`, owned by another porter: they replace
//! this file wholesale on merge. Only what `visit` needs today.
//!
//! `union_types_in_id_order` is the old-TypeScript (Strada) member order of a
//! union (by type id). TODO(port): the real implementation; this stub returns
//! tsrs's own order.

use tsrs_checker::Type;
use tsrs_core::P;

/// Go `UnionTypesInIdOrder`. STUB.
pub fn union_types_in_id_order(t: P<Type>) -> Vec<P<Type>> {
    t.types().to_vec()
}
