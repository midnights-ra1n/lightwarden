//! TOTP (RFC 6238) from a Base32 secret or an `otpauth://` URI, as stored in Bitwarden login items.
use hmac::{Hmac, Mac};
use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
pub struct Code {
    pub code: String,
    pub period: u64,
    pub remaining: u64, // seconds left before `code` changes
}

fn base32(s: &str) -> Option<Vec<u8>> {
    let (mut buf, mut bits, mut out) = (0u32, 0, Vec::new());
    for c in s.bytes().filter(|c| !matches!(c, b' ' | b'-' | b'=')) {
        let v = match c.to_ascii_uppercase() { c @ b'A'..=b'Z' => c - b'A', c @ b'2'..=b'7' => c - b'2' + 26, _ => return None };
        buf = buf << 5 | v as u32;
        bits += 5;
        if bits >= 8 { bits -= 8; out.push((buf >> bits) as u8); buf &= (1 << bits) - 1; }
    }
    (!out.is_empty()).then_some(out)
}

fn hotp<M: Mac + hmac::digest::KeyInit>(key: &[u8], counter: u64, digits: u32) -> String {
    let mut m = <M as Mac>::new_from_slice(key).expect("hmac takes any key length");
    m.update(&counter.to_be_bytes());
    let h = m.finalize().into_bytes();
    let o = (h[h.len() - 1] & 15) as usize;
    let n = u32::from_be_bytes([h[o] & 0x7f, h[o + 1], h[o + 2], h[o + 3]]);
    format!("{:0w$}", n % 10u32.pow(digits), w = digits as usize)
}

/// `input`: Base32 secret (spaces allowed) or `otpauth://totp/...?secret=..&period=..&digits=..&algorithm=..`.
pub fn code(input: &str, now: u64) -> Result<Code, String> {
    let input = input.trim();
    if input.starts_with("steam://") { return Err("Steam Guard n'est pas pris en charge.".into()); }
    let (mut secret, mut period, mut digits, mut algo) = (input.to_string(), 30u64, 6u32, "SHA1".to_string());
    if let Some(q) = input.strip_prefix("otpauth://").and_then(|r| r.split_once('?')).map(|x| x.1) {
        secret.clear();
        for (k, v) in q.split('&').filter_map(|p| p.split_once('=')) {
            match k.to_ascii_lowercase().as_str() {
                "secret" => secret = v.to_string(),
                "period" => period = v.parse().ok().filter(|p| *p > 0).unwrap_or(30),
                "digits" => digits = v.parse().ok().filter(|d| (6..=8).contains(d)).unwrap_or(6),
                "algorithm" => algo = v.to_ascii_uppercase(),
                _ => {}
            }
        }
    }
    let key = base32(&secret).ok_or("Clé TOTP invalide.")?;
    let c = now / period;
    let code = match algo.as_str() {
        "SHA256" => hotp::<Hmac<sha2::Sha256>>(&key, c, digits),
        "SHA512" => hotp::<Hmac<sha2::Sha512>>(&key, c, digits),
        _ => hotp::<Hmac<sha1::Sha1>>(&key, c, digits),
    };
    Ok(Code { code, period, remaining: period - now % period })
}

#[cfg(test)]
mod tests {
    use super::*;
    // RFC 6238 appendix B (8 digits), secret "12345678901234567890" in Base32
    const K: &str = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    #[test]
    fn rfc6238_vectors() {
        let u = |t, a| format!("otpauth://totp/x?secret={K}&digits=8&algorithm={a}&period=30").pipe(|s| code(&s, t).unwrap().code);
        assert_eq!(u(59, "SHA1"), "94287082");
        assert_eq!(u(1111111109, "SHA1"), "07081804");
    }
    #[test]
    fn plain_secret_and_remaining() {
        let c = code("gezd gnbv gy3t qojq gezd gnbv gy3t qojq", 59).unwrap();
        assert_eq!((c.code.as_str(), c.period, c.remaining), ("287082", 30, 1));
    }
    #[test]
    fn rejects_garbage() { assert!(code("not base32!", 0).is_err()); }
    trait Pipe: Sized { fn pipe<R>(self, f: impl FnOnce(Self) -> R) -> R { f(self) } }
    impl Pipe for String {}
}
