//! Go `tsutil.TypeToTypeNode`: `checker.TypeToTypeNode` with union members in
//! Strada's (type id) order, recording identifier -> symbol mappings of the
//! synthesized nodes in `synth`.
//!
//! TODO(schemas): not implemented yet; depends on the union/property order
//! port (tsutil typeorder/unionorder) owned by another agent.

use tsrs_ast::Node;
use tsrs_checker::Type;
use tsrs_core::P;

use super::fail;
use super::parser::Chk;
use super::parser::shared::SynthesizedSymbols;

pub fn type_to_type_node(
    _chk: &Chk,
    _t: P<Type>,
    _enclosing: Option<P<Node>>,
    _flags: u32,
    _synth: &SynthesizedSymbols,
) -> Option<P<Node>> {
    fail("TypeToTypeNode is not implemented yet")
}
