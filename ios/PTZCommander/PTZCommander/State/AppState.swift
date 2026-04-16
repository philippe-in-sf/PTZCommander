import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var serverAddress: String
    @Published var config: MobileConfig?
    @Published var cameras: [Camera] = []
    @Published var presets: [Preset] = []
    @Published var scenes: [SceneButton] = []
    @Published var macros: [Macro] = []
    @Published var selectedCameraId: Int?
    @Published var isLoading = false
    @Published var errorMessage: String?

    let socket = PTZCommanderSocket()

    private var api: PTZCommanderAPI?
    private let defaults: UserDefaults

    var selectedCamera: Camera? {
        cameras.first { $0.id == selectedCameraId }
    }

    var connected: Bool {
        if case .connected = socket.state {
            return true
        }
        return false
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.serverAddress = defaults.string(forKey: "ptzCommanderServerAddress") ?? "http://127.0.0.1:4101"
    }

    func bootstrap() async {
        if defaults.string(forKey: "ptzCommanderServerAddress") != nil {
            await connect()
        }
    }

    func connect() async {
        guard let serverURL = URL.normalizedServerAddress(serverAddress) else {
            errorMessage = "Enter a valid server address."
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let api = PTZCommanderAPI(baseURL: serverURL)
            let config: MobileConfig = try await api.get("/api/mobile/config")
            self.api = api
            self.config = config
            self.serverAddress = serverURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            defaults.set(self.serverAddress, forKey: "ptzCommanderServerAddress")
            socket.connect(to: serverURL, path: config.websocketPath)
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
            socket.disconnect()
        }
    }

    func refreshAll() async throws {
        guard let api else { return }

        async let cameras: [Camera] = api.get("/api/cameras")
        async let scenes: [SceneButton] = api.get("/api/scene-buttons")
        async let macros: [Macro] = api.get("/api/macros")

        self.cameras = try await cameras
        self.scenes = try await scenes.sorted { $0.buttonNumber < $1.buttonNumber }
        self.macros = try await macros.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        if selectedCameraId == nil || !self.cameras.contains(where: { $0.id == selectedCameraId }) {
            selectedCameraId = self.cameras.first?.id
        }

        await loadPresetsForSelectedCamera()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectCamera(_ camera: Camera) async {
        selectedCameraId = camera.id
        await loadPresetsForSelectedCamera()
    }

    func loadPresetsForSelectedCamera() async {
        guard let api, let selectedCameraId else {
            presets = []
            return
        }

        do {
            presets = try await api.get("/api/cameras/\(selectedCameraId)/presets")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func executeScene(_ scene: SceneButton) async {
        guard let api else { return }

        do {
            try await api.postNoContent("/api/scene-buttons/\(scene.id)/execute")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func executeMacro(_ macro: Macro) async {
        guard let api else { return }

        do {
            try await api.postNoContent("/api/macros/\(macro.id)/execute")
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
