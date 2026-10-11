import Capacitor
import WidgetKit

/// Lets the web app hand the home screen widgets their sign-in (a read-only widget
/// token) and refresh them. Registered in MainViewController; used from
/// src/utils/nativeApp.ts as `WidgetBridge`.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise)
    ]

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
}
