#!/usr/bin/env python3
"""Native GTK 4 quick panel (GNOME and other GTK desktops). Started by Lightwarden, talks JSON lines on stdin/stdout
(see src/quick.rs). GTK 4 cannot position windows, so the window opens where the window manager puts it."""
import json, sys, threading, urllib.request
import gi
gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
from gi.repository import Gdk, GLib, Gtk

pending, cache, next_id = {}, {}, [0]
fr = [False]
t = lambda f, e: f if fr[0] else e


def call(cmd, arg, cb):
    next_id[0] += 1
    pending[next_id[0]] = cb
    sys.stdout.write(json.dumps({"id": next_id[0], "cmd": cmd, "arg": arg}) + "\n")
    sys.stdout.flush()


def load_icon(url, image):
    if url in cache:
        image.set_from_paintable(cache[url])
        return

    def work():
        try:
            tex = Gdk.Texture.new_from_bytes(GLib.Bytes.new(urllib.request.urlopen(url, timeout=5).read()))
        except Exception:
            return

        def done():
            cache[url] = tex
            image.set_from_paintable(tex)
        GLib.idle_add(done)
    threading.Thread(target=work, daemon=True).start()


class Panel(Gtk.Window):
    def __init__(self, app):
        super().__init__(application=app, decorated=False, resizable=False, default_width=360, default_height=520)
        self.seq, self.seen_active, self.use_password, self.st = 0, False, False, {}
        self.connect("notify::is-active", self.on_active)
        keys = Gtk.EventControllerKey()
        keys.connect("key-pressed", lambda c, k, *_: self.hide_panel() if k == Gdk.KEY_Escape else False)
        self.add_controller(keys)

        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.set_child(root)
        self.stack = Gtk.Stack(vexpand=True)
        root.append(self.stack)
        root.append(Gtk.Separator())
        foot = Gtk.Box(spacing=8, margin_top=6, margin_bottom=6, margin_start=10, margin_end=10)
        self.open_btn = Gtk.Button(has_frame=False)
        self.open_btn.connect("clicked", lambda *_: (call("open", {}, None), self.hide_panel()))
        self.lock_btn = Gtk.Button(has_frame=False, halign=Gtk.Align.END, hexpand=True)
        self.lock_btn.connect("clicked", lambda *_: (call("lock", {}, None), self.reset()))
        foot.append(self.open_btn)
        foot.append(self.lock_btn)
        root.append(foot)

        # list page
        page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin_top=8, margin_bottom=4, margin_start=8, margin_end=8)
        self.search = Gtk.SearchEntry()
        self.search.connect("search-changed", lambda *_: self.do_search())
        self.search.connect("activate", lambda *_: self.copy_first())
        self.error = Gtk.Label(css_classes=["error"], wrap=True)
        self.rows = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE)
        scroll = Gtk.ScrolledWindow(vexpand=True, child=self.rows)
        page.append(self.search)
        page.append(self.error)
        page.append(scroll)
        self.stack.add_named(page, "open")

        # locked page
        lk = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, valign=Gtk.Align.CENTER, margin_start=40, margin_end=40)
        lk.append(Gtk.Image(icon_name="system-lock-screen-symbolic", pixel_size=48))
        self.email = Gtk.Label(css_classes=["dim-label"])
        self.secret = Gtk.PasswordEntry(show_peek_icon=True)
        self.secret.connect("activate", lambda *_: self.unlock_secret())
        self.lk_error = Gtk.Label(css_classes=["error"], wrap=True)
        self.sys_btn = Gtk.Button()
        self.sys_btn.connect("clicked", lambda *_: self.unlock("system", ""))
        self.mode_btn = Gtk.Button(has_frame=False)
        self.mode_btn.connect("clicked", lambda *_: (setattr(self, "use_password", not self.use_password), self.paint_locked()))
        for w in (self.email, self.secret, self.sys_btn, self.mode_btn, self.lk_error):
            lk.append(w)
        self.stack.add_named(lk, "locked")
        self.stack.add_named(Gtk.Label(label="…"), "none")

    def on_active(self, *_):
        if self.is_active():
            self.seen_active = True
        elif self.seen_active:
            self.hide_panel()

    def hide_panel(self):
        self.seen_active = False
        self.set_visible(False)
        return True

    def show_panel(self):
        if self.is_visible():
            self.hide_panel()
            return
        self.reset()
        self.present()

    def reset(self):
        self.search.set_text("")
        self.error.set_text("")
        self.lk_error.set_text("")
        self.secret.set_text("")
        call("state", {}, self.on_state)

    def on_state(self, st):
        self.st = st
        fr[0] = st.get("fr", False)
        self.open_btn.set_label(t("Ouvrir Lightwarden", "Open Lightwarden"))
        self.lock_btn.set_label(t("Verrouiller", "Lock"))
        self.search.set_placeholder_text(t("Rechercher…", "Search…"))
        self.lock_btn.set_visible(st.get("state") == "open")
        self.stack.set_visible_child_name(st.get("state", "none"))
        if st.get("state") == "open":
            self.do_search()
            self.search.grab_focus()
        elif st.get("state") == "locked":
            self.paint_locked()

    def paint_locked(self):
        by_pin = self.st.get("pin") and not self.use_password
        self.email.set_text(self.st.get("email", ""))
        self.secret.set_property("placeholder-text", t("Code PIN", "PIN") if by_pin else t("Mot de passe maître", "Master password"))
        self.sys_btn.set_label(t("Déverrouiller avec le système", "Unlock with system authentication"))
        self.sys_btn.set_visible(bool(self.st.get("system")))
        self.mode_btn.set_visible(bool(self.st.get("pin")))
        self.mode_btn.set_label(t("Utiliser le mot de passe maître", "Use master password") if by_pin else t("Utiliser le PIN", "Use PIN"))
        self.secret.grab_focus()

    def unlock_secret(self):
        by_pin = self.st.get("pin") and not self.use_password
        v = self.secret.get_text()
        self.secret.set_text("")
        self.unlock("pin" if by_pin else "password", v)

    def unlock(self, mode, value):
        def done(r):
            if "error" in r:
                self.lk_error.set_text(r["error"])
            else:
                self.reset()
        call("unlock", {"mode": mode, "value": value}, done)

    def do_search(self):
        self.seq += 1
        n = self.seq

        def done(r):
            if n != self.seq:
                return
            self.items = r.get("items", [])
            while (c := self.rows.get_first_child()) is not None:
                self.rows.remove(c)
            for it in self.items:
                self.rows.append(self.row(it))
        call("search", {"q": self.search.get_text()}, done)

    def copy_first(self):
        if getattr(self, "items", None):
            self.copy(self.items[0], "pass")

    def copy(self, it, field):
        def done(r):
            if "error" in r:
                self.error.set_text(r["error"])
            else:
                self.hide_panel()
        call("copy", {"id": it["id"], "field": field}, done)

    def row(self, it):
        box = Gtk.Box(spacing=8, margin_top=3, margin_bottom=3)
        img = Gtk.Image(icon_name="web-browser-symbolic", pixel_size=24)
        if it.get("icon"):
            load_icon(it["icon"], img)
        text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True, valign=Gtk.Align.CENTER)
        text.append(Gtk.Label(label=it["name"], xalign=0, ellipsize=3))
        if it.get("user"):
            text.append(Gtk.Label(label=it["user"], xalign=0, ellipsize=3, css_classes=["dim-label", "caption"]))
        box.append(img)
        box.append(text)
        btns = [("avatar-default-symbolic", t("Copier l'identifiant", "Copy username"), "user"),
                ("dialog-password-symbolic", t("Copier le mot de passe", "Copy password"), "pass")]
        if it.get("totp"):
            btns.append(("alarm-symbolic", t("Copier le code TOTP", "Copy TOTP code"), "totp"))
        for icon, tip, field in btns:
            b = Gtk.Button(icon_name=icon, has_frame=False, tooltip_text=tip)
            b.connect("clicked", lambda _b, f=field: self.copy(it, f))
            box.append(b)
        return box


def main():
    app = Gtk.Application(application_id="app.lightwarden.quick")
    panel = []

    def activate(a):
        if panel:
            return
        a.hold()  # stays alive with no window shown
        panel.append(Panel(a))

        def reader():
            for line in sys.stdin:
                msg = json.loads(line)
                if msg.get("event") == "toggle":
                    GLib.idle_add(lambda: panel[0].show_panel() and False)
                elif msg.get("id") in pending:
                    cb = pending.pop(msg["id"])
                    if cb:
                        GLib.idle_add(lambda cb=cb, r=msg.get("res", {}): cb(r) and False)
            GLib.idle_add(a.quit)  # the app closed the pipe
        threading.Thread(target=reader, daemon=True).start()
    app.connect("activate", activate)
    app.run(None)


main()
