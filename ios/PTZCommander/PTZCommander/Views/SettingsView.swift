import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server address", text: $appState.serverAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()

                    Button {
                        Task { await appState.connect() }
                    } label: {
                        Label("Reconnect", systemImage: "bolt.horizontal.circle")
                    }

                    Button {
                        Task { await appState.refresh() }
                    } label: {
                        Label("Refresh Data", systemImage: "arrow.clockwise")
                    }
                }

                Section("Status") {
                    LabeledContent("Connection") {
                        Text(appState.connected ? "Connected" : "Disconnected")
                            .foregroundStyle(appState.connected ? .green : .secondary)
                    }

                    if let config = appState.config {
                        LabeledContent("Server Version", value: config.version)
                        LabeledContent("WebSocket", value: config.websocketPath)
                    }

                    if let socketVersion = appState.socket.serverVersion {
                        LabeledContent("Socket Version", value: socketVersion)
                    }
                }

                Section("Loaded") {
                    LabeledContent("Cameras", value: "\(appState.cameras.count)")
                    LabeledContent("Scenes", value: "\(appState.scenes.count)")
                    LabeledContent("Macros", value: "\(appState.macros.count)")
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(AppState())
}
