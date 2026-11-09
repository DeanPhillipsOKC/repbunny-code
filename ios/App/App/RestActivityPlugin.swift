import Capacitor
import Foundation
import UIKit

// Issue #163: the web layer's handle on the lock-screen rest timer
// (src/lib/restLive.ts), the same contract as Android's
// RestActivityPlugin.java. Registered in MainViewController.
@objc(RestActivityPlugin)
public class RestActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestActivityPlugin"
    public let jsName = "RestActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setShowWhenLocked", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestUnlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?

    override public func load() {
        observer = NotificationCenter.default.addObserver(forName: RestLiveStore.didAct, object: nil, queue: .main) { [weak self] note in
            guard let action = note.userInfo?["action"] as? String else { return }
            self?.notifyListeners("restAction", data: ["action": action])
        }
    }

    deinit {
        if let observer = observer { NotificationCenter.default.removeObserver(observer) }
    }

    @objc func start(_ call: CAPPluginCall) {
        let rest: [String: Any] = [
            "id": Int64(call.getDouble("id") ?? 0),
            "workoutId": call.getString("workoutId").map { $0 as Any } ?? NSNull(),
            "exerciseName": call.getString("exerciseName") ?? "",
            "endsAt": Int64(call.getDouble("endsAt") ?? 0),
            "totalSeconds": Int64(call.getDouble("totalSeconds") ?? 0),
            "title": call.getString("title") ?? "",
            "text": call.getString("text") ?? "",
            "alertTitle": call.getString("alertTitle") ?? "",
            "alertBody": call.getString("alertBody") ?? "",
            "alertSound": call.getString("alertSound") ?? "",
        ]
        RestLiveStore.start(rest)
        call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        RestLiveStore.end()
        call.resolve()
    }

    @objc func getState(_ call: CAPPluginCall) {
        if let rest = RestLiveStore.load() {
            call.resolve(["rest": rest])
        } else {
            call.resolve(["rest": NSNull()])
        }
    }

    // Issue #166 is Android only: the Live Activity already shows on the
    // lock screen, so the app never needs to.
    @objc func setShowWhenLocked(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func requestUnlock(_ call: CAPPluginCall) {
        call.resolve(["unlocked": true])
    }

    // Issue #832: RepBunny's own notification page in Settings (iOS 16+),
    // falling back to its general Settings page.
    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var urlString = UIApplication.openSettingsURLString
            if #available(iOS 16.0, *) { urlString = UIApplication.openNotificationSettingsURLString }
            guard let url = URL(string: urlString) else { return call.reject("No settings page") }
            UIApplication.shared.open(url) { opened in
                if opened { call.resolve() } else { call.reject("Couldn't open settings") }
            }
        }
    }
}
