//! Port of Go `tsjg/formatter/reference_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use super::definition_type_formatter::definition_ref;
use crate::tsjg::schema::Def;
use crate::tsjg::types::{self, Ty, TypeKind};

pub struct ReferenceTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
    encode_refs: bool,
}

impl ReferenceTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>, encode_refs: bool) -> Rc<ReferenceTypeFormatter> {
        Rc::new(ReferenceTypeFormatter { child_type_formatter, encode_refs })
    }
}

impl TypeFormatter for ReferenceTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Reference(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        definition_ref(&t.name(), self.encode_refs)
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Reference(r) = &**t else { unreachable!() };
        let referred_type = r.ty();
        if matches!(&*referred_type, TypeKind::Definition(_)) {
            // We probably already have the definitions for the children created so
            // we could return nil. There are cases where we may not have (in
            // particular intersections of unions with recursion). To make sure we
            // create the necessary definitions, we return the children of the
            // referred type here. Because we cache definitions, this should not
            // incur any performance impact.
            return self.child_type_formatter.get_children(&referred_type);
        }
        // This means that the referred interface is protected, so we have to
        // expose it in the schema definitions.
        self.child_type_formatter.get_children(&types::new_definition_type(t.name(), referred_type))
    }
}
