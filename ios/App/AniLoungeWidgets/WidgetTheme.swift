import SwiftUI

/// The site themes (src/composables/useTheme.ts), so widgets match the app. The app saves
/// the chosen one in the App Group (WidgetShared.themeKey); colors mirror src/assets/styles/global.css.
enum WidgetTheme: String {
    case light, dawn, penumbra, dusk, dark

    /// The theme the app last saved (the site's default, dark, until one is picked).
    static var current: WidgetTheme {
        WidgetShared.defaults?.string(forKey: WidgetShared.themeKey).flatMap(WidgetTheme.init) ?? .dark
    }

    /// `--bg-primary`
    var background: Color {
        switch self {
        case .light: Color(hex: 0xF4F5F7)
        case .dawn: Color(hex: 0xF8EFE8)
        case .penumbra: Color(hex: 0x3A4253)
        case .dusk: Color(hex: 0x1F1830)
        case .dark: Color(hex: 0x0F1726)
        }
    }

    /// `--bg-secondary`: poster placeholders.
    var surface: Color {
        switch self {
        case .light: Color(hex: 0xECEEF2)
        case .dawn: Color(hex: 0xF3E5DC)
        case .penumbra: Color(hex: 0x414A5D)
        case .dusk: Color(hex: 0x261E3A)
        case .dark: Color(hex: 0x172133)
        }
    }

    /// `--text-primary`
    var text: Color {
        switch self {
        case .light: Color(hex: 0x152238)
        case .dawn: Color(hex: 0x3A2A3F)
        case .penumbra: Color(hex: 0xF1F3F7)
        case .dusk: Color(hex: 0xF1EBF7)
        case .dark: Color(hex: 0xE8EDF5)
        }
    }

    /// `--text-secondary`
    var muted: Color {
        switch self {
        case .light: Color(hex: 0x5B6578)
        case .dawn: Color(hex: 0x75606E)
        case .penumbra: Color(hex: 0xC9CFDB)
        case .dusk: Color(hex: 0xC3B6D3)
        case .dark: Color(hex: 0xAAB3C5)
        }
    }

    /// `--coral-primary` (the same in every theme).
    var accent: Color { Color(hex: 0xE07A5F) }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
