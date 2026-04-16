import SwiftUI

struct ScenesView: View {
    @EnvironmentObject private var appState: AppState

    private var groupedScenes: [(String, [SceneButton])] {
        Dictionary(grouping: appState.scenes) { $0.groupName ?? "General" }
            .map { ($0.key, $0.value.sorted { $0.buttonNumber < $1.buttonNumber }) }
            .sorted { $0.0.localizedCaseInsensitiveCompare($1.0) == .orderedAscending }
    }

    var body: some View {
        NavigationStack {
            List {
                if appState.scenes.isEmpty {
                    ContentUnavailableView(
                        "No Scenes",
                        systemImage: "square.grid.2x2",
                        description: Text("Create scene buttons in PTZCommander, then refresh here.")
                    )
                } else {
                    ForEach(groupedScenes, id: \.0) { group, scenes in
                        Section(group) {
                            ForEach(scenes) { scene in
                                Button {
                                    Task { await appState.executeScene(scene) }
                                } label: {
                                    HStack(spacing: 12) {
                                        Circle()
                                            .fill(Color(hex: scene.color))
                                            .frame(width: 14, height: 14)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(scene.name)
                                                .font(.headline)
                                            Text("Button \(scene.buttonNumber)")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Image(systemName: "play.fill")
                                            .foregroundStyle(.secondary)
                                    }
                                    .padding(.vertical, 6)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Scenes")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await appState.refresh() }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                }
            }
        }
    }
}

#Preview {
    ScenesView()
        .environmentObject(AppState())
}
