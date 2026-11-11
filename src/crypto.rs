//! Bitwarden key derivation and EncString (type 2: AES-256-CBC + HMAC-SHA256) decryption.
use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub enum Kdf {
    Pbkdf2 { iterations: u32 },
    Argon2id { iterations: u32, memory_mib: u32, parallelism: u32 },
}

#[derive(Clone)]
pub struct Key {
    enc: [u8; 32],
    mac: [u8; 32],
}

pub fn master_key(password: &str, email: &str, kdf: &Kdf) -> Result<[u8; 32], String> {
    let salt = email.trim().to_lowercase();
    let mut k = [0u8; 32];
    match kdf {
        Kdf::Pbkdf2 { iterations } => {
            pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt.as_bytes(), *iterations, &mut k)
        }
        Kdf::Argon2id { iterations, memory_mib, parallelism } => {
            let p = argon2::Params::new(memory_mib * 1024, *iterations, *parallelism, Some(32))
                .map_err(|e| e.to_string())?;
            argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, p)
                .hash_password_into(password.as_bytes(), &Sha256::digest(salt.as_bytes()), &mut k)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(k)
}

/// Value sent to the server instead of the password: PBKDF2(master key, password, 1 iteration).
pub fn master_password_hash(master: &[u8; 32], password: &str) -> String {
    let mut h = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(master, password.as_bytes(), 1, &mut h);
    B64.encode(h)
}

impl Key {
    /// Stretches the 32-byte master key into an enc/mac pair (HKDF-Expand "enc"/"mac").
    pub fn stretch(master: &[u8; 32]) -> Key {
        let hk = Hkdf::<Sha256>::from_prk(master).expect("32 bytes is a valid PRK");
        let (mut enc, mut mac) = ([0u8; 32], [0u8; 32]);
        hk.expand(b"enc", &mut enc).unwrap();
        hk.expand(b"mac", &mut mac).unwrap();
        Key { enc, mac }
    }

    /// Unwraps the account's protected user key (64 bytes: enc || mac).
    pub fn unwrap_user_key(&self, protected: &str) -> Result<Key, String> {
        let b = self.decrypt(protected)?;
        if b.len() != 64 {
            return Err("unsupported user key length".into());
        }
        Ok(Key { enc: b[..32].try_into().unwrap(), mac: b[32..].try_into().unwrap() })
    }

    /// EncString type 2 with a fresh random IV.
    pub fn encrypt(&self, pt: &[u8]) -> String {
        let mut iv = [0u8; 16];
        getrandom::fill(&mut iv).expect("OS RNG unavailable");
        let ct = cbc::Encryptor::<aes::Aes256>::new(&self.enc.into(), &iv.into()).encrypt_padded_vec_mut::<Pkcs7>(pt);
        let mut m = Hmac::<Sha256>::new_from_slice(&self.mac).unwrap();
        m.update(&iv);
        m.update(&ct);
        format!("2.{}|{}|{}", B64.encode(iv), B64.encode(&ct), B64.encode(m.finalize().into_bytes()))
    }

    pub fn decrypt_string(&self, s: &str) -> Result<String, String> {
        String::from_utf8(self.decrypt(s)?).map_err(|e| e.to_string())
    }

    pub fn decrypt(&self, s: &str) -> Result<Vec<u8>, String> {
        let (ty, rest) = s.split_once('.').ok_or("bad EncString")?;
        if ty != "2" {
            return Err(format!("unsupported EncString type {ty}"));
        }
        let p: Vec<_> = rest.split('|').map(|x| B64.decode(x).map_err(|e| e.to_string())).collect::<Result<_, _>>()?;
        let [iv, ct, mac] = p.as_slice() else { return Err("bad EncString".into()) };
        let mut m = Hmac::<Sha256>::new_from_slice(&self.mac).unwrap();
        m.update(iv);
        m.update(ct);
        m.verify_slice(mac).map_err(|_| "MAC mismatch (wrong password or corrupt data)")?; // constant time
        cbc::Decryptor::<aes::Aes256>::new_from_slices(&self.enc, iv)
            .map_err(|e| e.to_string())?
            .decrypt_padded_vec_mut::<Pkcs7>(ct)
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_tamper() {
        let mk = master_key("pw", " A@b.c ", &Kdf::Pbkdf2 { iterations: 10 }).unwrap();
        let k = Key::stretch(&mk);
        let e = k.encrypt(b"hello");
        assert_ne!(e, k.encrypt(b"hello"), "IV must be random");
        assert_eq!(k.decrypt_string(&e).unwrap(), "hello");
        let bad = e.replacen("|", "|AA", 1);
        assert!(k.decrypt_string(&bad).is_err());
        assert!(k.unwrap_user_key(&k.encrypt(&[1u8; 64])).is_ok());
    }
}
