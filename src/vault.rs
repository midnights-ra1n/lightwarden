//! Decrypted vault model shared with the UI. Folder tree, filtering and search live in ui/logic.js.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Serialize)]
pub struct Item {
    pub id: String,
    pub kind: i64, // 1 login, 2 note, 3 card, 4 identity, 5 SSH key
    pub name: String,
    pub notes: String,
    pub folder: String, // full path ("A/B"), "" = no folder
    pub data: BTreeMap<String, String>, // type-specific fields, Bitwarden names (username, number, privateKey…)
}

#[derive(Clone, Serialize, Default)]
pub struct Vault {
    pub folders: Vec<String>,
    pub items: Vec<Item>,
}

/// An item as edited in the UI; `id` is None for a new item.
#[derive(Deserialize)]
pub struct ItemInput {
    pub id: Option<String>,
    pub kind: i64,
    pub name: String,
    pub notes: String,
    pub folder: String,
    pub data: BTreeMap<String, String>,
}
