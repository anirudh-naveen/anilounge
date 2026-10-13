import Capacitor
import UIKit
import WidgetKit

/// Lets the web app hand the home screen widgets their sign-in (a widget token), tell
/// them and the app icon which site theme is picked, and refresh them. Registered in
/// MainViewController; used from src/utils/nativeApp.ts as `WidgetBridge`.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTheme", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppIcon", returnType: CAPPluginReturnPromise)
    ]

    /// Alternate app icons per theme (Assets.xcassets); the light theme uses the main icon.
    private static let themeIcons = [
        "dawn": "AppIconDawn",
        "penumbra": "AppIconPenumbra",
        "dusk": "AppIconDusk",
        "dark": "AppIconDark",
    ]
    private static let themes: Set<String> = ["light", "dawn", "penumbra", "dusk", "dark"]

    @objc func getToken(_ call: CAPPluginCall) {
        let token = WidgetShared.defaults?.string(forKey: WidgetShared.tokenKey)
        call.resolve(["token": token ?? NSNull()])
    }

    @objc func setToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("A token is required.")
            return
        }
        WidgetShared.defaults?.set(token, forKey: WidgetShared.tokenKey)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func clearToken(_ call: CAPPluginCall) {
        WidgetShared.defaults?.removeObject(forKey: WidgetShared.tokenKey)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func reload(_ call: CAPPluginCall) {
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Save the site theme for the widgets, refreshing them only when it changed.
    @objc func setTheme(_ call: CAPPluginCall) {
        guard let theme = call.getString("theme"), Self.themes.contains(theme) else {
            call.reject("Unknown theme.")
            return
        }
        if WidgetShared.defaults?.string(forKey: WidgetShared.themeKey) != theme {
            WidgetShared.defaults?.set(theme, forKey: WidgetShared.themeKey)
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    /// Switch the home screen icon to match a theme. iOS shows a short notice when an
    /// app changes its icon, so the web app only calls this when someone picks a theme.
    @objc func setAppIcon(_ call: CAPPluginCall) {
        guard let theme = call.getString("theme"), Self.themes.contains(theme) else {
            call.reject("Unknown theme.")
            return
        }
        let name = Self.themeIcons[theme]
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons, app.alternateIconName != name else {
                call.resolve(["changed": false])
                return
            }
            app.setAlternateIconName(name) { error in
                if let error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["changed": true])
                }
            }
        }
    }
}
