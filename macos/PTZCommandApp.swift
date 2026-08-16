import AppKit
import Foundation
import Security
import WebKit

private let defaultPort = 3478
private let allowedHosts = Set(["127.0.0.1", "localhost"])

@main
private enum PTZCommanderMain {
    static func main() {
        let application = NSApplication.shared
        let delegate = PTZCommandApp()
        application.setActivationPolicy(.regular)
        application.delegate = delegate
        withExtendedLifetime(delegate) {
            application.run()
        }
    }
}

final class PTZCommandApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var serverProcess: Process?
    private var appURL = URL(string: "http://127.0.0.1:\(defaultPort)/")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()
        configureWindow()
        showStartupPage()
        connectOrStartServer()
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let process = serverProcess, process.isRunning {
            process.terminate()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func configureWindow() {
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
        window.title = "PTZ Commander"
        window.minSize = NSSize(width: 980, height: 680)
        window.isReleasedWhenClosed = false
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()

        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func reloadPage() {
        connectOrStartServer()
    }

    private func connectOrStartServer() {
        checkServer { [weak self] isAvailable in
            guard let self else { return }
            if isAvailable {
                self.loadApp()
            } else if self.serverProcess?.isRunning == true {
                self.waitForServer(attempt: 0)
            } else {
                self.startBundledServer()
            }
        }
    }

    private func checkServer(completion: @escaping (Bool) -> Void) {
        let versionURL = appURL.appendingPathComponent("api/version")
        var request = URLRequest(url: versionURL)
        request.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let httpResponse = response as? HTTPURLResponse
            let hasVersion = data.flatMap {
                try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
            }?["version"] is String
            DispatchQueue.main.async {
                completion(httpResponse?.statusCode == 200 && hasVersion)
            }
        }.resume()
    }

    private func startBundledServer() {
        guard
            let resourcesURL = Bundle.main.resourceURL,
            let nodeURL = Bundle.main.url(forResource: "node", withExtension: nil, subdirectory: "runtime/bin"),
            let serverURL = Bundle.main.url(forResource: "index", withExtension: "cjs", subdirectory: "server/dist")
        else {
            showFatalError("The bundled PTZ Command server is missing. Reinstall the app and try again.")
            return
        }

        do {
            let supportURL = try applicationSupportURL()
            let logURL = supportURL.appendingPathComponent("server.log")
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
            let logHandle = try FileHandle(forWritingTo: logURL)
            try logHandle.seekToEnd()

            let process = Process()
            process.executableURL = nodeURL
            process.arguments = [serverURL.path]
            process.currentDirectoryURL = resourcesURL.appendingPathComponent("server")
            process.standardOutput = logHandle
            process.standardError = logHandle

            var environment = ProcessInfo.processInfo.environment
            environment["NODE_ENV"] = "production"
            environment["PORT"] = String(defaultPort)
            environment["DATABASE_PATH"] = supportURL.appendingPathComponent("ptzcommand.db").path
            environment["SESSION_SECRET"] = try loadOrCreateSecret(named: "session-secret")
            environment["SECRET_ENCRYPTION_KEY"] = try loadOrCreateSecret(named: "encryption-key")
            process.environment = environment
            process.terminationHandler = { [weak self] process in
                guard process.terminationStatus != 0 else { return }
                DispatchQueue.main.async {
                    self?.showFatalError("The bundled server stopped unexpectedly. Details are in ~/Library/Application Support/PTZ Command/server.log.")
                }
            }

            try process.run()
            serverProcess = process
            waitForServer(attempt: 0)
        } catch {
            showFatalError("The bundled server could not start: \(error.localizedDescription)")
        }
    }

    private func waitForServer(attempt: Int) {
        checkServer { [weak self] isAvailable in
            guard let self else { return }
            if isAvailable {
                self.loadApp()
            } else if attempt < 40 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    self.waitForServer(attempt: attempt + 1)
                }
            } else {
                self.showFatalError("PTZ Command did not become ready. Check ~/Library/Application Support/PTZ Command/server.log and try again.")
            }
        }
    }

    private func applicationSupportURL() throws -> URL {
        let baseURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let appSupportURL = baseURL.appendingPathComponent("PTZ Command", isDirectory: true)
        try FileManager.default.createDirectory(at: appSupportURL, withIntermediateDirectories: true)
        return appSupportURL
    }

    private func loadOrCreateSecret(named name: String) throws -> String {
        let secretURL = try applicationSupportURL().appendingPathComponent(name)
        if let existing = try? String(contentsOf: secretURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines), !existing.isEmpty {
            return existing
        }

        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
        let secret = Data(bytes).base64EncodedString()
        try (secret + "\n").write(to: secretURL, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: secretURL.path)
        return secret
    }

    private func loadApp() {
        webView.load(URLRequest(url: appURL, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    private func showStartupPage() {
        showStatusPage(
            title: "Starting PTZ Command",
            message: "Preparing the standalone app…",
            includeRetry: false
        )
    }

    private func showFatalError(_ message: String) {
        showStatusPage(title: "PTZ Command could not start", message: message, includeRetry: true)
    }

    private func showStatusPage(title: String, message: String, includeRetry: Bool) {
        let escapedTitle = escapeHTML(title)
        let escapedMessage = escapeHTML(message)
        let retry = includeRetry ? "<a href=\"http://127.0.0.1:\(defaultPort)/\">Try Again</a>" : ""
        let html = """
        <!doctype html>
        <html><head><meta name="viewport" content="width=device-width"><style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #090e19; color: #dbeafe; font: 15px -apple-system, sans-serif; }
        main { max-width: 560px; padding: 36px; border: 1px solid #263449; border-radius: 18px; background: #111827; text-align: center; }
        h1 { font-size: 24px; } p { color: #94a3b8; line-height: 1.5; }
        a { display: inline-block; margin-top: 12px; padding: 10px 18px; border-radius: 8px; background: #06b6d4; color: #041016; font-weight: 700; text-decoration: none; }
        </style></head><body><main><h1>\(escapedTitle)</h1><p>\(escapedMessage)</p>\(retry)</main></body></html>
        """
        webView.loadHTMLString(html, baseURL: appURL)
    }

    private func escapeHTML(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }

    private func configureMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About PTZ Commander", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit PTZ Commander", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
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
        decisionHandler(allowedHosts.contains(origin.host) && type == .camera ? .grant : .deny)
    }
}
