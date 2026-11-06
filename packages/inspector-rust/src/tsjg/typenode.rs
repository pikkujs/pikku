//! Go `tsutil.TypeToTypeNode`: `checker.TypeToTypeNode` with union members in
//! Strada's (type id) order, recording identifier -> symbol mappings of the
//! synthesized nodes in `synth`.
//!
//! TODO(schemas): the Strada union reorder (`ReorderTypeNode`) is owned by the
//! tsutil typeorder/unionorder port; until it lands this returns tsrs's own
//! order.

use tsrs_ast::Node;
use tsrs_checker::{Flags, InternalFlags, Type};
use tsrs_core::P;

use super::parser::Chk;
use super::parser::shared::SynthesizedSymbols;

pub fn type_to_type_node(
    chk: &Chk,
    t: P<Type>,
    enclosing: Option<P<Node>>,
    flags: u32,
    synth: &SynthesizedSymbols,
) -> Option<P<Node>> {
    chk.with(|c| {
        let nb = tsrs_checker::new_node_builder_ex(c, tsrs_printer::new_emit_context(), Some(synth.m));
        nb.type_to_type_node(c, t, enclosing, Flags::from_bits_retain(flags), InternalFlags::empty(), None)
    })
}
