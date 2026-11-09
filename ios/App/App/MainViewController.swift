import Capacitor
import UIKit

// Issue #163: registers the app's own plugins (ones that live in this
// project, not in an npm package), which Capacitor doesn't find by itself.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestActivityPlugin())
        bridge?.registerPluginInstance(AppIconPlugin())
        bridge?.registerPluginInstance(BackupFolderPlugin())
    }
}
