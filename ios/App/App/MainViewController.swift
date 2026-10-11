import Capacitor

/// The app's web view controller, plus the plugins that live in this app's own code.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
