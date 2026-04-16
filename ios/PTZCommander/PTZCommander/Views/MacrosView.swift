import SwiftUI

struct MacrosView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            List {
                if appState.macros.isEmpty {
                    ContentUnavailableView(
                        "No Macros",
                        systemImage: "play.rectangle.on.rectangle",
                        description: Text("Create macros in PTZCommander, then refresh here.")
                    )
                } else {
                    ForEach(appState.macros) { macro in
                        Button {
                            Task { await appState.executeMacro(macro) }
                        } label: {
                            HStack(spacing: 12) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(hex: macro.color))
                                    .frame(width: 14, height: 36)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(macro.name)
                                        .font(.headline)
                                    Text(macro.description ?? macro.notes ?? "Ready")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
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
            .navigationTitle("Macros")
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
    MacrosView()
        .environmentObject(AppState())
}
