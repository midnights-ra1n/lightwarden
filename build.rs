use std::{env, path::PathBuf, process::Command};

fn main() {
    tauri_build::build();
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") { swift_panel(); }
}

/// Compiles the native menu bar panel (native/macos/QuickPanel.swift) into a static lib and links it with the Swift runtime.
fn swift_panel() {
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let arch = if env::var("CARGO_CFG_TARGET_ARCH").unwrap() == "aarch64" { "arm64" } else { "x86_64" };
    let ok = Command::new("swiftc")
        .args(["-O", "-parse-as-library", "-swift-version", "5", "-emit-library", "-static", "-module-name", "QuickPanel", "-target"])
        .arg(format!("{arch}-apple-macos12.0")) // keep in step with minimumSystemVersion in tauri.conf.json
        .arg("native/macos/QuickPanel.swift").arg("-o").arg(out.join("libquickpanel.a"))
        .status().expect("swiftc not found (install Xcode or the command line tools)").success();
    assert!(ok, "swiftc failed");
    // the swift compatibility shims live in the toolchain, the runtime itself in the OS
    let swiftc = Command::new("xcrun").args(["--find", "swiftc"]).output().expect("xcrun").stdout;
    let toolchain = PathBuf::from(String::from_utf8_lossy(&swiftc).trim()).parent().unwrap().parent().unwrap().join("lib/swift/macosx");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-search=native={}", toolchain.display());
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    println!("cargo:rustc-link-lib=static=quickpanel");
    println!("cargo:rerun-if-changed=native/macos/QuickPanel.swift");
}
