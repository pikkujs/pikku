//! Port of Go `tsjg/formatter/alias_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::Def;
use crate::tsjg::types::{Ty, TypeKind};

pub struct AliasTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl AliasTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<AliasTypeFormatter> {
        Rc::new(AliasTypeFormatter { child_type_formatter })
    }
    fn inner(t: &Ty) -> Ty {
        match &**t {
            TypeKind::Alias(x) => x.ty.clone(),
            _ => unreachable!(),
        }
    }
}

impl TypeFormatter for AliasTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Alias(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        self.child_type_formatter.get_definition(&Self::inner(t))
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        self.child_type_formatter.get_children(&Self::inner(t))
    }
}
