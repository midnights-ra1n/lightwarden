//! SSH key import/generation: Bitwarden stores the unencrypted OpenSSH private key, public key and SHA256 fingerprint.
use serde::Serialize;
use ssh_key::{rand_core::OsRng, Algorithm, HashAlg, LineEnding, PrivateKey};

#[derive(Serialize)]
pub struct Parsed {
    pub private_key: String,
    pub public_key: String,
    pub fingerprint: String,
}

/// "PASSPHRASE" error means the key is encrypted and a passphrase is needed.
pub fn parse(text: &str, passphrase: &str) -> Result<Parsed, String> {
    let k = PrivateKey::from_openssh(text.trim())
        .map_err(|_| "Format non reconnu : seules les clés OpenSSH (« BEGIN OPENSSH PRIVATE KEY ») sont prises en charge.".to_string())?;
    let k = if k.is_encrypted() {
        if passphrase.is_empty() {
            return Err("PASSPHRASE".into());
        }
        k.decrypt(passphrase).map_err(|_| "Phrase de passe incorrecte.".to_string())?
    } else {
        k
    };
    describe(&k)
}

pub fn generate() -> Result<Parsed, String> {
    describe(&PrivateKey::random(&mut OsRng, Algorithm::Ed25519).map_err(|e| e.to_string())?)
}

fn describe(k: &PrivateKey) -> Result<Parsed, String> {
    Ok(Parsed {
        private_key: k.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?.to_string(),
        public_key: k.public_key().to_openssh().map_err(|e| e.to_string())?,
        fingerprint: k.fingerprint(HashAlg::Sha256).to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generate_then_parse() {
        let g = generate().unwrap();
        let p = parse(&g.private_key, "").unwrap();
        assert_eq!(p.public_key, g.public_key);
        assert!(p.fingerprint.starts_with("SHA256:"));
        let enc = PrivateKey::from_openssh(&g.private_key).unwrap().encrypt(&mut OsRng, "pw").unwrap().to_openssh(LineEnding::LF).unwrap();
        assert_eq!(parse(&enc, "").err().as_deref(), Some("PASSPHRASE"));
        assert!(parse(&enc, "bad").is_err());
        assert_eq!(parse(&enc, "pw").unwrap().fingerprint, g.fingerprint);
        assert!(parse("nope", "").is_err());
    }
}
