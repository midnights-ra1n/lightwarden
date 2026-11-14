using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Graphics;

namespace QuickPanel;

public sealed class Panel : Window
{
    const int W = 360, H = 520; // device-independent pixels
    static readonly StreamWriter Out = new(Console.OpenStandardOutput()) { AutoFlush = true };
    readonly ConcurrentDictionary<int, Action<JsonNode>?> pending = new();
    int nextId, seq;
    bool fr, usePassword, seenActive;
    JsonNode st = new JsonObject();
    JsonArray items = new();

    readonly TextBox search = new();
    readonly TextBlock error = new() { Foreground = new SolidColorBrush(Colors.IndianRed), TextWrapping = TextWrapping.Wrap };
    readonly StackPanel rows = new();
    readonly PasswordBox secret = new();
    readonly TextBlock email = new() { HorizontalAlignment = HorizontalAlignment.Center, Opacity = 0.7 };
    readonly TextBlock lkError = new() { Foreground = new SolidColorBrush(Colors.IndianRed), TextWrapping = TextWrapping.Wrap };
    readonly Button helloBtn = new() { HorizontalAlignment = HorizontalAlignment.Center };
    readonly Button modeBtn = new() { HorizontalAlignment = HorizontalAlignment.Center };
    readonly Button openBtn = new(), lockBtn = new();
    readonly Grid listPage = new(), lockedPage = new();
    readonly TextBlock nonePage = new() { Text = "…", HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };

    string T(string f, string e) => fr ? f : e;

    public Panel()
    {
        SystemBackdrop = new DesktopAcrylicBackdrop();
        var p = OverlappedPresenter.Create();
        p.SetBorderAndTitleBar(false, false);
        p.IsResizable = false; p.IsAlwaysOnTop = true; p.IsMaximizable = false; p.IsMinimizable = false;
        AppWindow.SetPresenter(p);
        AppWindow.IsShownInSwitchers = false;
        Activated += (_, a) =>
        {
            if (a.WindowActivationState == WindowActivationState.Deactivated) { if (seenActive) HidePanel(); }
            else seenActive = true;
        };

        search.TextChanged += (_, _) => DoSearch();
        search.KeyDown += (_, e) =>
        {
            if (e.Key == Windows.System.VirtualKey.Enter && items.Count > 0) Copy(items[0]!, "pass");
            if (e.Key == Windows.System.VirtualKey.Escape) HidePanel();
        };
        secret.KeyDown += (_, e) => { if (e.Key == Windows.System.VirtualKey.Enter) UnlockSecret(); };
        helloBtn.Click += (_, _) => Unlock("system", "");
        modeBtn.Click += (_, _) => { usePassword = !usePassword; PaintLocked(); };
        openBtn.Click += (_, _) => { Send("open", new JsonObject(), null); HidePanel(); };
        lockBtn.Click += (_, _) => { Send("lock", new JsonObject(), null); Reset(); };

        listPage.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        listPage.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        listPage.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        listPage.Padding = new Thickness(8);
        Place(listPage, search, 0); Place(listPage, error, 1);
        Place(listPage, new ScrollViewer { Content = rows }, 2);

        var lk = new StackPanel { Spacing = 10, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(40, 0, 40, 0) };
        lk.Children.Add(new FontIcon { Glyph = "", FontSize = 40, Opacity = 0.6 });
        foreach (var c in new UIElement[] { email, secret, helloBtn, modeBtn, lkError }) lk.Children.Add(c);
        lockedPage.Children.Add(lk);

        var foot = new Grid { Padding = new Thickness(8, 4, 8, 4) };
        foot.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        foot.ColumnDefinitions.Add(new ColumnDefinition());
        foot.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(openBtn, 0); Grid.SetColumn(lockBtn, 2);
        foot.Children.Add(openBtn); foot.Children.Add(lockBtn);

        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        Grid.SetRow(foot, 1);
        root.Children.Add(listPage); root.Children.Add(lockedPage); root.Children.Add(nonePage); root.Children.Add(foot);
        Content = root;
        Resize();
    }

    static void Place(Grid g, UIElement e, int row) { Grid.SetRow((FrameworkElement)e, row); g.Children.Add(e); }

    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
    double Scale() => GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(this)) / 96.0;
    void Resize() => AppWindow.Resize(new SizeInt32((int)(W * Scale()), (int)(H * Scale())));

    // ---- IPC (JSON lines, see src/quick.rs)
    void Send(string cmd, JsonObject arg, Action<JsonNode>? cb)
    {
        var id = Interlocked.Increment(ref nextId);
        pending[id] = cb;
        lock (Out) Out.WriteLine(new JsonObject { ["id"] = id, ["cmd"] = cmd, ["arg"] = arg }.ToJsonString());
    }

    public void OnMessage(string line)
    {
        JsonNode? m;
        try { m = JsonNode.Parse(line); } catch { return; }
        if (m is null) return;
        if ((string?)m["event"] == "toggle") { Toggle((double?)m["x"] ?? -1, (double?)m["y"] ?? -1); return; }
        if (m["id"] is { } id && pending.TryRemove((int)id, out var cb)) cb?.Invoke(m["res"] ?? new JsonObject());
    }

    // ---- show / hide
    void HidePanel() { seenActive = false; AppWindow.Hide(); }

    void Toggle(double x, double y)
    {
        if (AppWindow.IsVisible) { HidePanel(); return; }
        Resize();
        var size = AppWindow.Size;
        var area = DisplayArea.GetFromPoint(new PointInt32((int)x, (int)y), DisplayAreaFallback.Nearest).WorkArea;
        int px, py;
        if (x >= 0)
        {
            px = Math.Clamp((int)x - size.Width / 2, area.X + 8, area.X + area.Width - size.Width - 8);
            py = y > area.Y + area.Height / 2 ? (int)y - size.Height - 8 : (int)y + 8; // taskbar at the bottom: open upwards
            py = Math.Clamp(py, area.Y + 8, area.Y + area.Height - size.Height - 8);
        }
        else { px = area.X + area.Width - size.Width - 12; py = area.Y + area.Height - size.Height - 12; }
        AppWindow.Move(new PointInt32(px, py));
        Reset();
        AppWindow.Show();
        Activate();
    }

    // ---- state
    void Reset()
    {
        search.Text = ""; error.Text = ""; lkError.Text = ""; secret.Password = "";
        Send("state", new JsonObject(), r => DispatcherQueue.TryEnqueue(() => OnState(r)));
    }

    void OnState(JsonNode s)
    {
        st = s; fr = (bool?)s["fr"] ?? false;
        var state = (string?)s["state"] ?? "none";
        openBtn.Content = T("Ouvrir Lightwarden", "Open Lightwarden");
        lockBtn.Content = T("Verrouiller", "Lock");
        search.PlaceholderText = T("Rechercher…", "Search…");
        lockBtn.Visibility = state == "open" ? Visibility.Visible : Visibility.Collapsed;
        listPage.Visibility = state == "open" ? Visibility.Visible : Visibility.Collapsed;
        lockedPage.Visibility = state == "locked" ? Visibility.Visible : Visibility.Collapsed;
        nonePage.Visibility = state == "none" ? Visibility.Visible : Visibility.Collapsed;
        if (state == "open") { DoSearch(); search.Focus(FocusState.Programmatic); }
        else if (state == "locked") PaintLocked();
    }

    void PaintLocked()
    {
        bool byPin = ((bool?)st["pin"] ?? false) && !usePassword;
        email.Text = (string?)st["email"] ?? "";
        secret.PlaceholderText = byPin ? T("Code PIN", "PIN") : T("Mot de passe maître", "Master password");
        helloBtn.Content = T("Déverrouiller avec Windows Hello", "Unlock with Windows Hello");
        helloBtn.Visibility = (bool?)st["system"] == true ? Visibility.Visible : Visibility.Collapsed;
        modeBtn.Visibility = (bool?)st["pin"] == true ? Visibility.Visible : Visibility.Collapsed;
        modeBtn.Content = byPin ? T("Utiliser le mot de passe maître", "Use master password") : T("Utiliser le PIN", "Use PIN");
        secret.Focus(FocusState.Programmatic);
    }

    void UnlockSecret()
    {
        bool byPin = ((bool?)st["pin"] ?? false) && !usePassword;
        var v = secret.Password; secret.Password = "";
        Unlock(byPin ? "pin" : "password", v);
    }

    void Unlock(string mode, string value) =>
        Send("unlock", new JsonObject { ["mode"] = mode, ["value"] = value }, r => DispatcherQueue.TryEnqueue(() =>
        {
            if (r["error"] is { } e) lkError.Text = (string?)e ?? ""; else Reset();
        }));

    // ---- list
    void DoSearch()
    {
        var n = ++seq;
        Send("search", new JsonObject { ["q"] = search.Text }, r => DispatcherQueue.TryEnqueue(() =>
        {
            if (n != seq) return;
            items = r["items"] as JsonArray ?? new JsonArray();
            rows.Children.Clear();
            foreach (var it in items) rows.Children.Add(Row(it!));
        }));
    }

    void Copy(JsonNode it, string field) =>
        Send("copy", new JsonObject { ["id"] = (string?)it["id"], ["field"] = field }, r => DispatcherQueue.TryEnqueue(() =>
        {
            if (r["error"] is { } e) error.Text = (string?)e ?? ""; else HidePanel();
        }));

    UIElement Row(JsonNode it)
    {
        var g = new Grid { ColumnSpacing = 8, Padding = new Thickness(6, 4, 6, 4) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        UIElement icon = new FontIcon { Glyph = "", FontSize = 18, Opacity = 0.6, Width = 22 };
        if (!string.IsNullOrEmpty((string?)it["icon"]))
            icon = new Image { Width = 22, Height = 22, Source = new BitmapImage(new Uri((string)it["icon"]!)) };
        Grid.SetColumn((FrameworkElement)icon, 0); g.Children.Add(icon);

        var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        text.Children.Add(new TextBlock { Text = (string?)it["name"] ?? "", TextTrimming = TextTrimming.CharacterEllipsis });
        if (!string.IsNullOrEmpty((string?)it["user"]))
            text.Children.Add(new TextBlock { Text = (string)it["user"]!, FontSize = 11, Opacity = 0.6, TextTrimming = TextTrimming.CharacterEllipsis });
        Grid.SetColumn(text, 1); g.Children.Add(text);

        var btns = new StackPanel { Orientation = Orientation.Horizontal };
        Button B(string glyph, string tip, string field)
        {
            var b = new Button { Content = new FontIcon { Glyph = glyph, FontSize = 14 }, Background = new SolidColorBrush(Colors.Transparent),
                                 BorderThickness = new Thickness(0), Padding = new Thickness(6) };
            ToolTipService.SetToolTip(b, tip);
            b.Click += (_, _) => Copy(it, field);
            return b;
        }
        btns.Children.Add(B("", T("Copier l'identifiant", "Copy username"), "user"));
        btns.Children.Add(B("", T("Copier le mot de passe", "Copy password"), "pass"));
        if ((bool?)it["totp"] == true) btns.Children.Add(B("", T("Copier le code TOTP", "Copy TOTP code"), "totp"));
        Grid.SetColumn(btns, 2); g.Children.Add(btns);
        return g;
    }
}
