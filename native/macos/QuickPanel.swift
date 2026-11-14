// Native macOS quick panel (menu bar popover): search, copy, unlock. All data comes from the Rust side
// through one JSON handler (see src/quick.rs); this file only draws and forwards.
import AppKit
import SwiftUI

public typealias Handler = @convention(c) (UnsafePointer<CChar>, UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?
public typealias Free = @convention(c) (UnsafeMutablePointer<CChar>?) -> Void
private var handler: Handler?
private var freeFn: Free?
private var fr = false
private func t(_ f: String, _ e: String) -> String { fr ? f : e }

private func call(_ cmd: String, _ arg: [String: Any] = [:]) -> [String: Any] {
    guard let h = handler, let f = freeFn,
          let data = try? JSONSerialization.data(withJSONObject: arg),
          let json = String(data: data, encoding: .utf8),
          let p = cmd.withCString({ c in json.withCString { h(c, $0) } }) else { return ["error": "?"] }
    defer { f(p) }
    return (try? JSONSerialization.jsonObject(with: Data(String(cString: p).utf8)) as? [String: Any]) ?? [:]
}

struct Item: Identifiable {
    let id: String, name: String, user: String, icon: String, totp: Bool
}

final class Model: ObservableObject {
    @Published var state = "none"
    @Published var email = ""
    @Published var pin = false
    @Published var system = false
    @Published var query = ""
    @Published var items: [Item] = []
    @Published var error: String?
    private var seq = 0

    func reset() {
        query = ""; items = []; error = nil
        let s = call("state")
        fr = s["fr"] as? Bool ?? false
        state = s["state"] as? String ?? "none"
        email = s["email"] as? String ?? ""
        pin = s["pin"] as? Bool ?? false
        system = s["system"] as? Bool ?? false
        if state == "open" { search() }
    }

    // Off the main thread: the Rust side may wait on a vault that is syncing.
    func search() {
        seq += 1
        let n = seq, q = query
        DispatchQueue.global().async {
            let r = call("search", ["q": q])
            let rows = (r["items"] as? [[String: Any]] ?? []).map {
                Item(id: $0["id"] as? String ?? "", name: $0["name"] as? String ?? "",
                     user: $0["user"] as? String ?? "", icon: $0["icon"] as? String ?? "", totp: $0["totp"] as? Bool ?? false)
            }
            DispatchQueue.main.async { if n == self.seq { self.items = rows } }
        }
    }

    func run(_ cmd: String, _ arg: [String: Any], then done: @escaping () -> Void) {
        DispatchQueue.global().async {
            let r = call(cmd, arg)
            DispatchQueue.main.async {
                if let e = r["error"] as? String { self.error = e } else { self.error = nil; done() }
            }
        }
    }

    func copy(_ it: Item, _ field: String) {
        run("copy", ["id": it.id, "field": field]) { Controller.shared.close() }
    }

    func unlock(_ mode: String, _ value: String = "") {
        run("unlock", ["mode": mode, "value": value]) { self.reset() }
    }
}

struct PanelView: View {
    @ObservedObject var m: Model
    @State private var secret = ""
    @State private var usePassword = false
    @FocusState private var focus: Bool

    var body: some View {
        VStack(spacing: 0) {
            switch m.state {
            case "open": list
            case "locked": locked
            default: Text(t("Aucun compte configuré.", "No account set up.")).foregroundColor(.secondary).frame(maxHeight: .infinity)
            }
            Divider()
            HStack {
                Button(t("Ouvrir Lightwarden", "Open Lightwarden")) { _ = call("open"); Controller.shared.close() }
                Spacer()
                if m.state == "open" {
                    Button(t("Verrouiller", "Lock")) { _ = call("lock"); m.reset() }
                }
            }
            .buttonStyle(.borderless).padding(.horizontal, 12).padding(.vertical, 8)
        }
        .frame(width: 360, height: 520)
        .onExitCommand { Controller.shared.close() }
        .onAppear { focus = true }
    }

    var list: some View {
        VStack(spacing: 0) {
            TextField(t("Rechercher…", "Search…"), text: $m.query)
                .textFieldStyle(.roundedBorder).focused($focus).padding(8)
                .onChange(of: m.query) { _ in m.search() }
                .onSubmit { if let f = m.items.first { m.copy(f, "pass") } } // Return = copy the first match's password
            if let e = m.error { Text(e).font(.caption).foregroundColor(.red).padding(.horizontal, 10) }
            if m.items.isEmpty {
                Text(t("Aucun résultat", "No results")).foregroundColor(.secondary).frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) { ForEach(m.items) { Row(it: $0, m: m) } }.padding(.horizontal, 6)
                }
            }
        }
    }

    var locked: some View {
        VStack(spacing: 10) {
            Image(systemName: "lock.fill").font(.largeTitle).foregroundColor(.secondary)
            Text(m.email).font(.caption).foregroundColor(.secondary)
            let byPin = m.pin && !usePassword
            SecureField(byPin ? t("Code PIN", "PIN") : t("Mot de passe maître", "Master password"), text: $secret)
                .textFieldStyle(.roundedBorder).focused($focus).frame(width: 220)
                .onSubmit { let s = secret; secret = ""; m.unlock(byPin ? "pin" : "password", s) }
            if m.system { Button(t("Déverrouiller avec Touch ID", "Unlock with Touch ID")) { m.unlock("system") } }
            if m.pin {
                Button(byPin ? t("Utiliser le mot de passe maître", "Use master password") : t("Utiliser le PIN", "Use PIN")) { usePassword.toggle(); secret = "" }
                    .buttonStyle(.borderless).font(.caption)
            }
            if let e = m.error { Text(e).font(.caption).foregroundColor(.red).multilineTextAlignment(.center) }
        }
        .padding().frame(maxHeight: .infinity)
    }

}

struct Row: View {
    let it: Item
    @ObservedObject var m: Model
    @State private var hover = false

    var body: some View {
        HStack(spacing: 8) {
            Fav(url: it.icon)
            VStack(alignment: .leading, spacing: 0) {
                Text(it.name).font(.system(size: 13)).lineLimit(1)
                if !it.user.isEmpty { Text(it.user).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1) }
            }
            Spacer(minLength: 4)
            action("person", t("Copier l'identifiant", "Copy username")) { m.copy(it, "user") }
            action("key", t("Copier le mot de passe", "Copy password")) { m.copy(it, "pass") }
            if it.totp { action("clock", t("Copier le code TOTP", "Copy TOTP code")) { m.copy(it, "totp") } }
        }
        .padding(.horizontal, 6).padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 6).fill(hover ? Color.primary.opacity(0.08) : .clear))
        .onHover { hover = $0 }
    }

    func action(_ icon: String, _ help: String, _ f: @escaping () -> Void) -> some View {
        Button(action: f) { Image(systemName: icon).frame(width: 18) }.buttonStyle(.borderless).help(help)
    }
}

struct Fav: View {
    let url: String
    var body: some View {
        Group {
            if let u = URL(string: url) {
                AsyncImage(url: u) { p in if let i = p.image { i.resizable().scaledToFit() } else { fallback } }
            } else { fallback }
        }
        .frame(width: 22, height: 22).clipShape(RoundedRectangle(cornerRadius: 5))
    }
    var fallback: some View { Image(systemName: "globe").foregroundColor(.secondary) }
}

final class KeyPanel: NSPanel { override var canBecomeKey: Bool { true } }

final class Controller: NSObject {
    static let shared = Controller()
    private let panel = KeyPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 520),
                                 styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    private let model = Model()
    private var closedAt = Date.distantPast

    override init() {
        super.init()
        let fx = NSVisualEffectView()
        fx.material = .popover; fx.blendingMode = .behindWindow; fx.state = .active
        fx.wantsLayer = true; fx.layer?.cornerRadius = 12; fx.layer?.masksToBounds = true
        let host = NSHostingView(rootView: PanelView(m: model))
        host.translatesAutoresizingMaskIntoConstraints = false
        fx.addSubview(host)
        NSLayoutConstraint.activate([host.leadingAnchor.constraint(equalTo: fx.leadingAnchor), host.trailingAnchor.constraint(equalTo: fx.trailingAnchor),
                                     host.topAnchor.constraint(equalTo: fx.topAnchor), host.bottomAnchor.constraint(equalTo: fx.bottomAnchor)])
        panel.contentView = fx
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.level = .popUpMenu; panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification, object: panel, queue: .main) { [weak self] _ in self?.close() }
    }

    func close() {
        guard panel.isVisible else { return }
        closedAt = Date(); panel.orderOut(nil); model.query = ""; model.items = []
    }

    func toggle() {
        // the click that dismissed the panel also lands on the icon: don't reopen at once
        if panel.isVisible || Date().timeIntervalSince(closedAt) < 0.25 { close(); return }
        // under the menu bar, never in the notch: the click that got us here was on the tray icon
        let p = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(p, $0.frame, false) } ?? NSScreen.main ?? NSScreen.screens[0]
        let vf = screen.visibleFrame, sz = panel.frame.size
        let top = min(vf.maxY, screen.frame.maxY - screen.safeAreaInsets.top)
        let x = min(max(p.x - sz.width / 2, vf.minX + 8), vf.maxX - sz.width - 8)
        panel.setFrameOrigin(NSPoint(x: x, y: top - sz.height - 6))
        model.reset()
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
    }
}

@_cdecl("lw_panel_init")
public func lw_panel_init(_ h: Handler, _ f: Free) { handler = h; freeFn = f }

@_cdecl("lw_panel_toggle")
public func lw_panel_toggle() { Controller.shared.toggle() }
