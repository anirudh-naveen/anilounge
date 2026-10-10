import Foundation

/// What the app and its widgets share. Compiled into both targets.
enum WidgetShared {
    /// App Group both targets belong to (App.entitlements, AniLoungeWidgets.entitlements).
    static let appGroup = "group.net.anilounge.app"
    /// The widget token the signed-in app stores for the widgets (see services/widgetService.js).
    static let tokenKey = "widgetToken"
    static var feedURL: URL {
        #if DEBUG
        // Debug builds can read a local feed instead (set "widgetFeedURL" in the group's defaults).
        if let override = defaults?.string(forKey: "widgetFeedURL"), let url = URL(string: override) {
            return url
        }
        #endif
        return URL(string: "https://www.anilounge.net/api/widget/feed")!
    }
    /// Widget taps open `anilounge://app/<path>`; the app routes that path (src/utils/nativeApp.ts).
    static func appURL(path: String) -> URL {
        URL(string: "anilounge://app" + (path.hasPrefix("/") ? path : "/" + path))
            ?? URL(string: "anilounge://app/")!
    }

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
}
