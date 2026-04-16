import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            if appState.config == nil {
                SetupView()
            } else {
                TabView {
                    CameraControlView()
                        .tabItem {
                            Label("Cameras", systemImage: "video")
                        }

                    ScenesView()
                        .tabItem {
                            Label("Scenes", systemImage: "square.grid.2x2")
                        }

                    MacrosView()
                        .tabItem {
                            Label("Macros", systemImage: "play.rectangle.on.rectangle")
                        }

                    SettingsView()
                        .tabItem {
                            Label("Settings", systemImage: "gearshape")
                        }
                }
            }
        }
        .overlay(alignment: .top) {
            if let errorMessage = appState.errorMessage {
                ErrorBanner(message: errorMessage) {
                    appState.errorMessage = nil
                }
                .padding(.horizontal)
                .padding(.top, 8)
            }
        }
    }
}

private struct ErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
            Text(message)
                .font(.footnote)
                .lineLimit(3)
            Spacer()
            Button("Dismiss", action: onDismiss)
                .font(.footnote.weight(.semibold))
        }
        .padding(12)
        .foregroundStyle(.white)
        .background(Color.red.gradient, in: RoundedRectangle(cornerRadius: 8))
        .shadow(radius: 12)
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
