import SwiftUI

struct CameraControlView: View {
    @EnvironmentObject private var appState: AppState
    @State private var panTiltSpeed = 0.5
    @State private var zoomSpeed = 0.5
    @State private var focusSpeed = 0.5

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    connectionStrip

                    if appState.cameras.isEmpty {
                        ContentUnavailableView(
                            "No Cameras",
                            systemImage: "video.slash",
                            description: Text("Add or discover cameras from PTZCommander, then refresh here.")
                        )
                    } else {
                        cameraPicker
                        selectedCameraCard
                        ptzPad
                        lensControls
                        presetGrid
                    }
                }
                .padding()
            }
            .navigationTitle("Cameras")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await appState.refresh() }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .disabled(appState.isLoading)
                }
            }
        }
    }

    private var connectionStrip: some View {
        HStack {
            Circle()
                .fill(appState.connected ? Color.green : Color.red)
                .frame(width: 10, height: 10)
            Text(appState.connected ? "Connected" : "Disconnected")
                .font(.subheadline.weight(.semibold))
            Spacer()
            if let version = appState.config?.version {
                Text("v\(version)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }

    private var cameraPicker: some View {
        Picker("Camera", selection: Binding(
            get: { appState.selectedCameraId ?? appState.cameras.first?.id ?? 0 },
            set: { id in
                if let camera = appState.cameras.first(where: { $0.id == id }) {
                    Task { await appState.selectCamera(camera) }
                }
            }
        )) {
            ForEach(appState.cameras) { camera in
                Text(camera.name).tag(camera.id)
            }
        }
        .pickerStyle(.menu)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var selectedCameraCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let camera = appState.selectedCamera {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(camera.name)
                            .font(.title2.bold())
                        Text("\(camera.ip):\(camera.port)")
                            .font(.callout.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    StatusBadge(status: camera.status)
                }

                if camera.tallyState != "off" {
                    Label(camera.tallyState.uppercased(), systemImage: "record.circle")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(camera.tallyState == "program" ? .red : .green)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
    }

    private var ptzPad: some View {
        VStack(spacing: 12) {
            Text("Pan / Tilt")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)

            Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                GridRow {
                    Spacer()
                    MomentaryControlButton(title: "Up", systemImage: "chevron.up") {
                        move(pan: 0, tilt: 1)
                    } onRelease: {
                        stopMove()
                    }
                    Spacer()
                }
                GridRow {
                    MomentaryControlButton(title: "Left", systemImage: "chevron.left") {
                        move(pan: -1, tilt: 0)
                    } onRelease: {
                        stopMove()
                    }
                    MomentaryControlButton(title: "Stop", systemImage: "stop.fill") {
                        stopMove()
                    } onRelease: {}
                    MomentaryControlButton(title: "Right", systemImage: "chevron.right") {
                        move(pan: 1, tilt: 0)
                    } onRelease: {
                        stopMove()
                    }
                }
                GridRow {
                    Spacer()
                    MomentaryControlButton(title: "Down", systemImage: "chevron.down") {
                        move(pan: 0, tilt: -1)
                    } onRelease: {
                        stopMove()
                    }
                    Spacer()
                }
            }

            speedSlider(title: "PTZ Speed", value: $panTiltSpeed)
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
    }

    private var lensControls: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Lens")
                .font(.headline)

            HStack(spacing: 12) {
                MomentaryControlButton(title: "Wide", systemImage: "minus.magnifyingglass") {
                    zoom(direction: -1)
                } onRelease: {
                    zoom(direction: 0)
                }
                MomentaryControlButton(title: "Tele", systemImage: "plus.magnifyingglass") {
                    zoom(direction: 1)
                } onRelease: {
                    zoom(direction: 0)
                }
            }
            speedSlider(title: "Zoom Speed", value: $zoomSpeed)

            HStack(spacing: 12) {
                MomentaryControlButton(title: "Near", systemImage: "arrow.left.and.right") {
                    focusNear()
                } onRelease: {
                    focusStop()
                }
                MomentaryControlButton(title: "Far", systemImage: "arrow.right.and.line.vertical.and.arrow.left") {
                    focusFar()
                } onRelease: {
                    focusStop()
                }
            }
            Button {
                if let cameraId = appState.selectedCameraId {
                    appState.socket.focusAuto(cameraId: cameraId)
                }
            } label: {
                Label("Auto Focus", systemImage: "scope")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            speedSlider(title: "Focus Speed", value: $focusSpeed)
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
    }

    private var presetGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Presets")
                .font(.headline)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(0..<9, id: \.self) { index in
                    let presetNumber = index
                    let preset = appState.presets.first { $0.presetNumber == presetNumber }
                    Button {
                        if let cameraId = appState.selectedCameraId {
                            appState.socket.recallPreset(cameraId: cameraId, presetNumber: presetNumber)
                        }
                    } label: {
                        VStack(spacing: 4) {
                            Text("\(presetNumber + 1)")
                                .font(.headline)
                            Text(preset?.name ?? "Preset")
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, minHeight: 58)
                    }
                    .buttonStyle(.bordered)
                    .disabled(appState.selectedCameraId == nil)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
    }

    private func speedSlider(title: String, value: Binding<Double>) -> some View {
        VStack(alignment: .leading) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value.wrappedValue * 100))%")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
            Slider(value: value, in: 0.1...1.0)
        }
        .font(.subheadline)
    }

    private func move(pan: Double, tilt: Double) {
        guard let cameraId = appState.selectedCameraId else { return }
        appState.socket.panTilt(cameraId: cameraId, pan: pan, tilt: tilt, speed: panTiltSpeed)
    }

    private func stopMove() {
        guard let cameraId = appState.selectedCameraId else { return }
        appState.socket.panTiltStop(cameraId: cameraId)
    }

    private func zoom(direction: Double) {
        guard let cameraId = appState.selectedCameraId else { return }
        appState.socket.zoom(cameraId: cameraId, direction: direction, speed: zoomSpeed)
    }

    private func focusFar() {
        guard let cameraId = appState.selectedCameraId else { return }
        appState.socket.focusFar(cameraId: cameraId, speed: focusSpeed)
    }

    private func focusNear() {
        guard let cameraId = appState.selectedCameraId else { return }
        appState.socket.focusNear(cameraId: cameraId, speed: focusSpeed)
    }

    private func focusStop() {
        guard let cameraId = appState.selectedCameraId else { return }
        appState.socket.focusStop(cameraId: cameraId)
    }
}

private struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(status.uppercased())
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .foregroundStyle(.white)
            .background(status == "online" ? Color.green : Color.gray, in: Capsule())
    }
}

#Preview {
    CameraControlView()
        .environmentObject(AppState())
}
