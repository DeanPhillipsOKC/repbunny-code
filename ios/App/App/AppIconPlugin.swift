import Capacitor
import UIKit

// Issue #169: the web layer's handle on the home-screen icon
// (src/lib/appIcon.ts), the same contract as Android's AppIconPlugin.java.
// Each theme and seasonal icon is an alternate icon set in Assets.xcassets
// named by its id and listed in project.pbxproj's
// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES; Classic is the primary icon
// (nil). iOS shows its own "You have changed the icon" alert on every switch.
// Registered in MainViewController.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getName", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setName", returnType: CAPPluginReturnPromise),
    ]

    private static let classic = "classic"

    @objc func getName(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else { return call.reject("Alternate icons aren't supported") }
            call.resolve(["name": UIApplication.shared.alternateIconName ?? AppIconPlugin.classic])
        }
    }

    @objc func setName(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { return call.reject("No app icon name") }
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else { return call.reject("Alternate icons aren't supported") }
            let iconName: String? = name == AppIconPlugin.classic ? nil : name
            if UIApplication.shared.alternateIconName == iconName { return call.resolve() }
            UIApplication.shared.setAlternateIconName(iconName) { error in
                if let error = error {
                    call.reject("No app icon called \(name)", nil, error)
                } else {
                    call.resolve()
                }
            }
        }
    }
}
