import Foundation

@MainActor
final class PTZCommanderSocket: ObservableObject {
    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case failed(String)
    }

    @Published private(set) var state: ConnectionState = .disconnected
    @Published private(set) var serverVersion: String?

    private var task: URLSessionWebSocketTask?
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func connect(to serverURL: URL, path: String = "/ws") {
        disconnect()

        guard var components = URLComponents(url: serverURL, resolvingAgainstBaseURL: false) else {
            state = .failed("Invalid server URL")
            return
        }

        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = path

        guard let websocketURL = components.url else {
            state = .failed("Invalid WebSocket URL")
            return
        }

        state = .connecting
        let task = session.webSocketTask(with: websocketURL)
        self.task = task
        task.resume()
        state = .connected

        Task { await receiveLoop() }
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        state = .disconnected
    }

    func panTilt(cameraId: Int, pan: Double, tilt: Double, speed: Double) {
        send([
            "type": "pan_tilt",
            "cameraId": cameraId,
            "pan": pan,
            "tilt": tilt,
            "speed": speed,
        ])
    }

    func panTiltStop(cameraId: Int) {
        send(["type": "pan_tilt_stop", "cameraId": cameraId])
    }

    func zoom(cameraId: Int, direction: Double, speed: Double) {
        send([
            "type": "zoom",
            "cameraId": cameraId,
            "zoom": direction,
            "speed": speed,
        ])
    }

    func focusFar(cameraId: Int, speed: Double) {
        send(["type": "focus_far", "cameraId": cameraId, "speed": speed])
    }

    func focusNear(cameraId: Int, speed: Double) {
        send(["type": "focus_near", "cameraId": cameraId, "speed": speed])
    }

    func focusStop(cameraId: Int) {
        send(["type": "focus_stop", "cameraId": cameraId])
    }

    func focusAuto(cameraId: Int) {
        send(["type": "focus_auto", "cameraId": cameraId])
    }

    func recallPreset(cameraId: Int, presetNumber: Int) {
        send([
            "type": "recall_preset",
            "cameraId": cameraId,
            "presetNumber": presetNumber,
        ])
    }

    private func send(_ payload: [String: Any]) {
        guard let task else { return }

        do {
            let data = try JSONSerialization.data(withJSONObject: payload, options: [])
            guard let string = String(data: data, encoding: .utf8) else { return }
            task.send(.string(string)) { error in
                if let error {
                    Task { @MainActor in self.state = .failed(error.localizedDescription) }
                }
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func receiveLoop() async {
        guard let task else { return }

        while self.task === task {
            do {
                let message = try await task.receive()
                handle(message)
            } catch {
                if self.task === task {
                    state = .failed(error.localizedDescription)
                }
                return
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch message {
        case .string(let string):
            data = string.data(using: .utf8)
        case .data(let messageData):
            data = messageData
        @unknown default:
            data = nil
        }

        guard
            let data,
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = object["type"] as? String
        else {
            return
        }

        if type == "version", let version = object["version"] as? String {
            serverVersion = version
        }
    }
}
