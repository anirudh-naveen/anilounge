import Foundation

/// What the app, its widgets, and its share extension share. Compiled into all three.
enum WidgetShared {
    /// App Group both targets belong to (App.entitlements, AniLoungeWidgets.entitlements).
    static let appGroup = "group.net.anilounge.app"
    /// The widget token the signed-in app stores for the widgets (see services/widgetService.js).
    static let tokenKey = "widgetToken"
    /// The site theme the app last saved (WidgetTheme.swift reads it).
    static let themeKey = "widgetTheme"
    static var feedURL: URL {
        #if DEBUG
        // Debug builds can read a local feed instead (set "widgetFeedURL" in the group's defaults).
        if let override = defaults?.string(forKey: "widgetFeedURL"), let url = URL(string: override) {
            return url
        }
        #endif
        return URL(string: "https://www.anilounge.net/api/widget/feed")!
    }
    /// An API endpoint, e.g. `api(path: "widget/share/lookup")`.
    static func api(path: String) -> URL {
        #if DEBUG
        // Debug builds can use a local API instead (set "apiBaseURL" in the group's defaults).
        if let base = defaults?.string(forKey: "apiBaseURL"), let url = URL(string: base + path) {
            return url
        }
        #endif
        return URL(string: "https://www.anilounge.net/api/" + path)!
    }

    /// Widget taps open `anilounge://app/<path>`; the app routes that path (src/utils/nativeApp.ts).
    static func appURL(path: String) -> URL {
        URL(string: "anilounge://app" + (path.hasPrefix("/") ? path : "/" + path))
            ?? URL(string: "anilounge://app/")!
    }

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
}
