//! Decrypted vault model. Folder tree, filtering and search live in the UI (ui/logic.js).
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct Item {
    pub kind: i64, // 1 login, 2 note, 3 card, 4 identity, 5 SSH key
    pub name: String,
    pub username: String,
    pub password: String,
    pub uri: String,
    pub notes: String,
    pub folder: String, // full path ("A/B"), "" = no folder
}

#[derive(Clone, Serialize, Default)]
pub struct Vault {
    pub folders: Vec<String>,
    pub items: Vec<Item>,
}
