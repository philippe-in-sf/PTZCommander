import SwiftUI

extension Color {
    init(hex: String) {
        let trimmed = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: trimmed).scanHexInt64(&value)

        let red: Double
        let green: Double
        let blue: Double

        switch trimmed.count {
        case 6:
            red = Double((value >> 16) & 0xff) / 255
            green = Double((value >> 8) & 0xff) / 255
            blue = Double(value & 0xff) / 255
        default:
            red = 0.0
            green = 0.7
            blue = 0.8
        }

        self.init(red: red, green: green, blue: blue)
    }
}
