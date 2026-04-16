import SwiftUI

struct MomentaryControlButton: View {
    let title: String
    let systemImage: String
    let onPress: () -> Void
    let onRelease: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: {}) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.title2.weight(.semibold))
                Text(title)
                    .font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 72)
            .foregroundStyle(isPressed ? .white : .primary)
            .background(isPressed ? Color.accentColor : Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !isPressed else { return }
                    isPressed = true
                    onPress()
                }
                .onEnded { _ in
                    isPressed = false
                    onRelease()
                }
        )
    }
}

#Preview {
    MomentaryControlButton(title: "Up", systemImage: "chevron.up") {} onRelease: {}
        .padding()
}
