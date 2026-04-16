import Foundation

enum PTZAPIError: LocalizedError {
    case invalidServerAddress
    case invalidResponse
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidServerAddress:
            return "Enter a valid PTZCommander server address."
        case .invalidResponse:
            return "The server returned an unexpected response."
        case .serverError(let status, let message):
            return "Server returned \(status): \(message)"
        }
    }
}

struct PTZCommanderAPI {
    let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        let request = try makeRequest(path: path, method: "GET")
        return try await send(request)
    }

    func post<T: Decodable>(_ path: String) async throws -> T {
        let request = try makeRequest(path: path, method: "POST")
        return try await send(request)
    }

    func postNoContent(_ path: String) async throws {
        let request = try makeRequest(path: path, method: "POST")
        _ = try await sendRaw(request)
    }

    private func makeRequest(path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw PTZAPIError.invalidServerAddress
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data = try await sendRaw(request)
        if T.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! T
        }
        return try decoder.decode(T.self, from: data)
    }

    private func sendRaw(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw PTZAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
            throw PTZAPIError.serverError(httpResponse.statusCode, message)
        }

        return data
    }
}

extension URL {
    static func normalizedServerAddress(_ value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let candidate = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        guard var components = URLComponents(string: candidate) else { return nil }

        if components.port == nil, components.scheme == "http" {
            components.port = 4101
        }

        return components.url
    }
}
