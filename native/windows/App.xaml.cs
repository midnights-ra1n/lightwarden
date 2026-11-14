using Microsoft.UI.Xaml;

namespace QuickPanel;

// Window created at launch and kept hidden; the Lightwarden app sends "toggle" over stdin (see src/quick.rs).
public partial class App : Application
{
    Panel? panel;
    public App() { InitializeComponent(); }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var p = panel = new Panel();
        var queue = p.DispatcherQueue;
        new Thread(() =>
        {
            var stdin = new StreamReader(Console.OpenStandardInput());
            string? line;
            while ((line = stdin.ReadLine()) != null) { var l = line; queue.TryEnqueue(() => p.OnMessage(l)); }
            Environment.Exit(0); // the app closed the pipe
        }) { IsBackground = true }.Start();
    }
}
