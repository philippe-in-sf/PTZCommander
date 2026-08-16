import AppKit
import CryptoKit
import Foundation
import Security
import WebKit

private let defaultPort = 3478
private let allowedHosts = Set(["127.0.0.1", "localhost"])

private struct ServerVersionMetadata: Decodable {
    let version: String
}

private struct DesktopUpdateManifest: Decodable {
    let version: String
    let platform: String
    let available: Bool
    let downloadUrl: String?
    let sha256: String?
    let sizeBytes: Int?
}

private enum DesktopUpdateError: LocalizedError {
    case invalidResponse
    case invalidDownloadURL
    case unavailable
    case checksumMismatch
    case invalidArchive
    case invalidBundle
    case versionMismatch(expected: String, actual: String)
    case installLocationNotWritable
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "The update server returned an invalid response."
        case .invalidDownloadURL: return "The update download address is invalid."
        case .unavailable: return "The thin client has not published a macOS update package."
        case .checksumMismatch: return "The downloaded update failed its SHA-256 integrity check."
        case .invalidArchive: return "The update archive does not contain a PTZ Commander app."
        case .invalidBundle: return "The downloaded app has the wrong bundle identity or an invalid signature."
        case .versionMismatch(let expected, let actual):
            return "The downloaded app is version \(actual), but version \(expected) was expected."
        case .installLocationNotWritable: return "PTZ Commander cannot replace itself at its current location."
        case .commandFailed(let command): return "The update command failed: \(command)"
        }
    }
}

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
    private var lastPromptedServerVersion: String?
    private var updateInProgress = false

    private var desktopVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

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
        checkServer { [weak self] serverVersion in
            guard let self else { return }
            if let serverVersion {
                self.loadApp()
                self.checkForDesktopUpdate(serverVersion: serverVersion, userInitiated: false)
            } else if self.serverProcess?.isRunning == true {
                self.waitForServer(attempt: 0)
            } else {
                self.startBundledServer()
            }
        }
    }

    private func checkServer(completion: @escaping (String?) -> Void) {
        let versionURL = appURL.appendingPathComponent("api/version")
        var request = URLRequest(url: versionURL)
        request.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let httpResponse = response as? HTTPURLResponse
            let metadata = data.flatMap { try? JSONDecoder().decode(ServerVersionMetadata.self, from: $0) }
            DispatchQueue.main.async {
                completion(httpResponse?.statusCode == 200 ? metadata?.version : nil)
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
        checkServer { [weak self] serverVersion in
            guard let self else { return }
            if let serverVersion {
                self.loadApp()
                self.checkForDesktopUpdate(serverVersion: serverVersion, userInitiated: false)
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

    @objc private func checkForUpdates(_ sender: Any?) {
        checkServer { [weak self] serverVersion in
            guard let self else { return }
            guard let serverVersion else {
                self.showAlert(
                    title: "Unable to Check for Updates",
                    message: "The local thin client is not responding on port \(defaultPort)."
                )
                return
            }
            self.checkForDesktopUpdate(serverVersion: serverVersion, userInitiated: true)
        }
    }

    private func checkForDesktopUpdate(serverVersion: String, userInitiated: Bool) {
        guard !updateInProgress else { return }

        let comparison = serverVersion.compare(desktopVersion, options: .numeric)
        if comparison == .orderedSame {
            if userInitiated {
                showAlert(
                    title: "PTZ Commander Is Up to Date",
                    message: "The thick and thin clients are both version \(desktopVersion)."
                )
            }
            return
        }

        if !userInitiated && lastPromptedServerVersion == serverVersion { return }
        lastPromptedServerVersion = serverVersion

        guard comparison == .orderedDescending else {
            showAlert(
                title: "Client Version Mismatch",
                message: "This thick client is version \(desktopVersion), while the local thin client is older at \(serverVersion). Upgrade the thin client before changing the desktop app."
            )
            return
        }

        let manifestURL = appURL.appendingPathComponent("api/desktop-update")
        var request = URLRequest(url: manifestURL)
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }
            do {
                guard error == nil,
                      (response as? HTTPURLResponse)?.statusCode == 200,
                      let data,
                      let manifest = try? JSONDecoder().decode(DesktopUpdateManifest.self, from: data),
                      manifest.platform == "macos",
                      manifest.version == serverVersion else {
                    throw DesktopUpdateError.invalidResponse
                }

                DispatchQueue.main.async {
                    self.presentUpdate(manifest: manifest)
                }
            } catch {
                DispatchQueue.main.async {
                    self.showAlert(title: "Update Check Failed", message: error.localizedDescription)
                }
            }
        }.resume()
    }

    private func presentUpdate(manifest: DesktopUpdateManifest) {
        guard manifest.available,
              manifest.downloadUrl != nil,
              manifest.sha256 != nil,
              manifest.sizeBytes != nil else {
            showAlert(
                title: "Desktop Update Not Published",
                message: "Thin client \(manifest.version) is newer than this thick client (\(desktopVersion)), but its macOS update package is unavailable. Build the macOS app package on the thin-client host, then check again."
            )
            return
        }

        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "PTZ Commander \(manifest.version) Is Available"
        alert.informativeText = "The local thin client is newer than this thick client (\(desktopVersion)). PTZ Commander can upgrade itself in place and relaunch."
        alert.addButton(withTitle: "Upgrade and Relaunch")
        alert.addButton(withTitle: "Later")
        if alert.runModal() == .alertFirstButtonReturn {
            beginDesktopUpdate(manifest: manifest)
        }
    }

    private func beginDesktopUpdate(manifest: DesktopUpdateManifest) {
        guard let relativeDownloadURL = manifest.downloadUrl,
              let downloadURL = URL(string: relativeDownloadURL, relativeTo: appURL)?.absoluteURL,
              downloadURL.scheme == appURL.scheme,
              downloadURL.host == appURL.host,
              downloadURL.port == appURL.port else {
            showAlert(title: "Update Failed", message: DesktopUpdateError.invalidDownloadURL.localizedDescription)
            return
        }

        updateInProgress = true
        showStatusPage(
            title: "Updating PTZ Commander",
            message: "Downloading and verifying version \(manifest.version)…",
            includeRetry: false
        )

        var request = URLRequest(url: downloadURL)
        request.timeoutInterval = 300
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.downloadTask(with: request) { [weak self] temporaryURL, response, error in
            guard let self else { return }
            do {
                guard error == nil,
                      (response as? HTTPURLResponse)?.statusCode == 200,
                      let temporaryURL,
                      let expectedChecksum = manifest.sha256,
                      let expectedSize = manifest.sizeBytes else {
                    throw DesktopUpdateError.invalidResponse
                }

                let workDirectory = FileManager.default.temporaryDirectory
                    .appendingPathComponent("ptzcommander-update-\(UUID().uuidString)", isDirectory: true)
                try FileManager.default.createDirectory(at: workDirectory, withIntermediateDirectories: true)
                let archiveURL = workDirectory.appendingPathComponent("PTZ-Commander-macOS.zip")
                try FileManager.default.moveItem(at: temporaryURL, to: archiveURL)

                DispatchQueue.global(qos: .userInitiated).async {
                    do {
                        let attributes = try FileManager.default.attributesOfItem(atPath: archiveURL.path)
                        let actualSize = (attributes[.size] as? NSNumber)?.intValue ?? -1
                        guard actualSize == expectedSize else { throw DesktopUpdateError.invalidResponse }
                        guard try self.sha256(of: archiveURL) == expectedChecksum.lowercased() else {
                            throw DesktopUpdateError.checksumMismatch
                        }

                        let stagedAppURL = try self.extractAndValidateUpdate(
                            archiveURL: archiveURL,
                            workDirectory: workDirectory,
                            expectedVersion: manifest.version
                        )
                        DispatchQueue.main.async {
                            do {
                                try self.launchReplacement(
                                    stagedAppURL: stagedAppURL,
                                    workDirectory: workDirectory
                                )
                                NSApp.terminate(nil)
                            } catch {
                                self.updateFailed(error, workDirectory: workDirectory)
                            }
                        }
                    } catch {
                        DispatchQueue.main.async {
                            self.updateFailed(error, workDirectory: workDirectory)
                        }
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self.updateFailed(error, workDirectory: nil)
                }
            }
        }.resume()
    }

    private func sha256(of fileURL: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            let data = try handle.read(upToCount: 1_048_576) ?? Data()
            if data.isEmpty { break }
            hasher.update(data: data)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func extractAndValidateUpdate(
        archiveURL: URL,
        workDirectory: URL,
        expectedVersion: String
    ) throws -> URL {
        let extractionURL = workDirectory.appendingPathComponent("extracted", isDirectory: true)
        try FileManager.default.createDirectory(at: extractionURL, withIntermediateDirectories: true)
        try runCommand("/usr/bin/ditto", arguments: ["-x", "-k", archiveURL.path, extractionURL.path])

        guard let contents = try? FileManager.default.contentsOfDirectory(
            at: extractionURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ), let appURL = contents.first(where: { $0.pathExtension == "app" }) else {
            throw DesktopUpdateError.invalidArchive
        }

        guard let candidateBundle = Bundle(url: appURL),
              candidateBundle.bundleIdentifier == Bundle.main.bundleIdentifier else {
            throw DesktopUpdateError.invalidBundle
        }
        let candidateVersion = candidateBundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        guard candidateVersion == expectedVersion else {
            throw DesktopUpdateError.versionMismatch(expected: expectedVersion, actual: candidateVersion)
        }
        do {
            try runCommand("/usr/bin/codesign", arguments: ["--verify", "--deep", "--strict", appURL.path])
        } catch {
            throw DesktopUpdateError.invalidBundle
        }
        return appURL
    }

    private func runCommand(_ executable: String, arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw DesktopUpdateError.commandFailed(URL(fileURLWithPath: executable).lastPathComponent)
        }
    }

    private func launchReplacement(stagedAppURL: URL, workDirectory: URL) throws {
        let targetAppURL = Bundle.main.bundleURL.standardizedFileURL
        let parentURL = targetAppURL.deletingLastPathComponent()
        guard targetAppURL.pathExtension == "app",
              FileManager.default.isWritableFile(atPath: parentURL.path) else {
            throw DesktopUpdateError.installLocationNotWritable
        }

        let backupURL = parentURL.appendingPathComponent(".\(targetAppURL.lastPathComponent).previous-update")
        let script = """
        set -eu
        pid="$1"
        target="$2"
        staged="$3"
        backup="$4"
        workdir="$5"
        while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
        if [ -e "$backup" ]; then /bin/rm -rf "$backup"; fi
        /bin/mv "$target" "$backup"
        if /bin/mv "$staged" "$target"; then
          if /usr/bin/open "$target"; then
            /bin/rm -rf "$backup" "$workdir"
          else
            /bin/rm -rf "$target"
            /bin/mv "$backup" "$target"
            /usr/bin/open "$target"
            exit 1
          fi
        else
          /bin/mv "$backup" "$target"
          exit 1
        fi
        """

        let updater = Process()
        updater.executableURL = URL(fileURLWithPath: "/bin/sh")
        updater.arguments = [
            "-c", script, "ptzcommander-updater", String(ProcessInfo.processInfo.processIdentifier),
            targetAppURL.path, stagedAppURL.path, backupURL.path, workDirectory.path,
        ]
        updater.standardOutput = FileHandle.nullDevice
        updater.standardError = FileHandle.nullDevice
        try updater.run()
    }

    private func updateFailed(_ error: Error, workDirectory: URL?) {
        updateInProgress = false
        if let workDirectory { try? FileManager.default.removeItem(at: workDirectory) }
        loadApp()
        showAlert(title: "Update Failed", message: error.localizedDescription)
    }

    private func showAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
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
        let updateItem = NSMenuItem(title: "Check for Updates…", action: #selector(checkForUpdates(_:)), keyEquivalent: "")
        updateItem.target = self
        appMenu.addItem(updateItem)
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
