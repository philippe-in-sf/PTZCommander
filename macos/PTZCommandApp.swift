import AppKit
import WebKit

private let appURL = URL(string: "http://127.0.0.1:3478/")!
private let allowedHosts = Set(["127.0.0.1", "localhost"])

@main
final class PTZCommandApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 960),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "PTZ Command"
        window.minSize = NSSize(width: 980, height: 680)
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)

        NSApp.activate(ignoringOtherApps: true)
        loadApp()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    @objc private func reloadPage() {
        if webView.url == nil || webView.url?.scheme == "about" {
            loadApp()
        } else {
            webView.reload()
        }
    }

    private func loadApp() {
        webView.load(URLRequest(url: appURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    private func configureMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About PTZ Command", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit PTZ Command", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        let reloadItem = NSMenuItem(title: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        reloadItem.target = self
        viewMenu.addItem(reloadItem)
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        NSApp.mainMenu = mainMenu
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.scheme == "about" || allowedHosts.contains(url.host ?? "") {
            decisionHandler(.allow)
            return
        }

        if navigationAction.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    @available(macOS 12.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        let isLocalApp = allowedHosts.contains(origin.host)
        decisionHandler(isLocalApp && type == .camera ? .grant : .deny)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        showConnectionError(error)
    }

    private func showConnectionError(_ error: Error) {
        let message = error.localizedDescription
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let html = """
        <!doctype html>
        <html><head><meta name="viewport" content="width=device-width"><style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #090e19; color: #dbeafe; font: 15px -apple-system, sans-serif; }
        main { max-width: 520px; padding: 36px; border: 1px solid #263449; border-radius: 18px; background: #111827; text-align: center; }
        h1 { font-size: 24px; } p { color: #94a3b8; line-height: 1.5; }
        a { display: inline-block; margin-top: 12px; padding: 10px 18px; border-radius: 8px; background: #06b6d4; color: #041016; font-weight: 700; text-decoration: none; }
        </style></head><body><main><h1>PTZ Command is not responding</h1>
        <p>The local background service at 127.0.0.1:3478 could not be reached.</p>
        <p>\(message)</p><a href="http://127.0.0.1:3478/">Try Again</a></main></body></html>
        """
        webView.loadHTMLString(html, baseURL: appURL)
    }
}
