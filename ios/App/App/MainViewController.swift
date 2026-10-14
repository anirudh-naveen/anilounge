import Capacitor
import UIKit

/// The app's web view controller, plus the plugins that live in this app's own code.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        // Pinch zoom is off (Capacitor's zoomEnabled), so a zoom iOS starts on its own,
        // like focusing a small text field, can't be pinched back out. Undo it when the
        // keyboard goes away.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(resetZoom),
            name: UIResponder.keyboardDidHideNotification,
            object: nil
        )
    }

    @objc private func resetZoom() {
        guard let scrollView = webView?.scrollView,
              scrollView.zoomScale != scrollView.minimumZoomScale else { return }
        scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
    }
}
