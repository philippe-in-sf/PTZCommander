import Foundation

struct MobileConfig: Decodable {
    let appName: String
    let version: String
    let websocketPath: String
    let features: MobileFeatures
    let endpoints: MobileEndpoints
}

struct MobileFeatures: Decodable {
    let cameras: Bool
    let presets: Bool
    let scenes: Bool
    let macros: Bool
    let lighting: Bool
    let switcher: Bool
    let mixer: Bool
}

struct MobileEndpoints: Decodable {
    let cameras: String
    let scenes: String
    let macros: String
    let deviceHealth: String
}

struct Camera: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let ip: String
    let port: Int
    let protocolName: String
    let streamUrl: String?
    let atemInputId: Int?
    let tallyState: String
    let status: String
    let isProgramOutput: Bool
    let isPreviewOutput: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case ip
        case port
        case protocolName = "protocol"
        case streamUrl
        case atemInputId
        case tallyState
        case status
        case isProgramOutput
        case isPreviewOutput
    }
}

struct Preset: Decodable, Identifiable, Equatable {
    let id: Int
    let cameraId: Int
    let presetNumber: Int
    let name: String?
    let thumbnail: String?
}

struct SceneButton: Decodable, Identifiable, Equatable {
    let id: Int
    let buttonNumber: Int
    let name: String
    let color: String
    let groupName: String?
    let atemInputId: Int?
    let atemTransitionType: String?
    let cameraId: Int?
    let presetNumber: Int?
}

struct Macro: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let description: String?
    let notes: String?
    let color: String
}

struct EmptyResponse: Decodable {}
