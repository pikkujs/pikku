//! Port of Go `tsjg/formatter/optional_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::Def;
use crate::tsjg::types::{Ty, TypeKind};

pub struct OptionalTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl OptionalTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<OptionalTypeFormatter> {
        Rc::new(OptionalTypeFormatter { child_type_formatter })
    }
    fn inner(t: &Ty) -> Ty {
        match &**t {
            TypeKind::Optional(x) => x.ty.clone(),
            _ => unreachable!(),
        }
    }
}

impl TypeFormatter for OptionalTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Optional(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        self.child_type_formatter.get_definition(&Self::inner(t))
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        self.child_type_formatter.get_children(&Self::inner(t))
    }
}
