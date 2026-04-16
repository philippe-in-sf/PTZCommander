import SwiftUI

struct SetupView: View {
    @EnvironmentObject private var appState: AppState
    @FocusState private var serverFieldFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("PTZ Command")
                        .font(.largeTitle.bold())
                    Text("Connect to the PTZCommander server running on your local network.")
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Server")
                        .font(.headline)
                    TextField("http://192.168.0.96:4101", text: $appState.serverAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .focused($serverFieldFocused)
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.go)
                        .onSubmit {
                            Task { await appState.connect() }
                        }
                    Text("Use the Mac or server IP address. If you omit a port, the app uses 4101.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Button {
                    Task { await appState.connect() }
                } label: {
                    HStack {
                        if appState.isLoading {
                            ProgressView()
                        }
                        Text(appState.isLoading ? "Connecting" : "Connect")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(appState.isLoading)

                Spacer()
            }
            .padding()
            .navigationTitle("Setup")
            .onAppear {
                serverFieldFocused = true
            }
        }
    }
}

#Preview {
    SetupView()
        .environmentObject(AppState())
}
