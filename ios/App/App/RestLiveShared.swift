import ActivityKit
import AppIntents
import Foundation
import UserNotifications

// Issue #163 (Premium): the rest timer on the iPhone lock screen and in the
// Dynamic Island, the iPhone half of #143 (Android: RestLive.java). Built
// into both the app and the RestLiveWidget extension: the extension draws
// the Live Activity, and the +15s / Skip buttons are LiveActivityIntents,
// which the system runs in the app's own process (launching it in the
// background if it was killed), so the running rest can live in the app's
// UserDefaults with no App Group.
//
// The web layer (src/lib/restLive.ts) passes every string shown here except
// the two button labels, and reconciles with the stored rest when it wakes
// (src/lib/restLiveState.ts, whose addRestTime addTime mirrors).

@available(iOS 16.1, *)
struct RestActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var endsAt: Date
        var totalSeconds: Int
        var title: String
        var text: String
        var alertTitle: String
    }

    var restId: Int64
}

enum RestLiveStore {
    // Posted after a lock-screen button changes the rest, so a running
    // RestActivityPlugin can tell the web layer.
    static let didAct = Notification.Name("app.repbunny.restLiveAction")

    private static let key = "repbunny_rest_live"
    // #78's alert is @capacitor/local-notifications' ID 1; this is ours.
    private static let alertId = "rest-live-end"
    private static let addSeconds: Int64 = 15

    static func load() -> [String: Any]? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    static func start(_ options: [String: Any]) {
        var rest = options
        rest["status"] = "running"
        save(rest)
        scheduleAlert(rest)
        refreshActivity()
    }

    // Ends the countdown and its alert, delivered or not.
    static func end() {
        UserDefaults.standard.removeObject(forKey: key)
        cancelAlert()
        refreshActivity()
    }

    static func addTime() -> Bool {
        guard var rest = load(), isRunning(rest) else { return false }
        let now = nowMs()
        let endsAt = max(now, int(rest, "endsAt")) + addSeconds * 1000
        let left = (endsAt - now + 999) / 1000
        rest["endsAt"] = endsAt
        rest["totalSeconds"] = max(int(rest, "totalSeconds"), left)
        save(rest)
        scheduleAlert(rest)
        return true
    }

    // Kept as "skipped" (not cleared) so the app can tell this rest was
    // skipped; the app clears it once it catches up.
    static func skip() -> Bool {
        guard var rest = load(), isRunning(rest) else { return false }
        rest["status"] = "skipped"
        save(rest)
        cancelAlert()
        return true
    }

    static func notifyApp(_ action: String) {
        NotificationCenter.default.post(name: didAct, object: nil, userInfo: ["action": action])
    }

    static func isRunning(_ rest: [String: Any]?) -> Bool {
        (rest?["status"] as? String) == "running"
    }

    static func int(_ rest: [String: Any], _ key: String) -> Int64 {
        (rest[key] as? NSNumber)?.int64Value ?? 0
    }

    static func string(_ rest: [String: Any], _ key: String) -> String {
        rest[key] as? String ?? ""
    }

    static func nowMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }

    private static func refreshActivity() {
        if #available(iOS 17.0, *) {
            // The main queue keeps start, +15s, and end in the order they came.
            DispatchQueue.main.async {
                MainActor.assumeIsolated { RestLiveActivity.enqueueSync() }
            }
        }
    }

    private static func save(_ rest: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: rest) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    // Stands in for #78's alert, so +15s on the lock screen moves it too.
    private static func scheduleAlert(_ rest: [String: Any]) {
        let content = UNMutableNotificationContent()
        content.title = string(rest, "alertTitle")
        content.body = string(rest, "alertBody")
        content.sound = alertSound(string(rest, "alertSound"))
        let seconds = max(1, Double(int(rest, "endsAt") - nowMs()) / 1000)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        // Same identifier, so this replaces the alert of a rest it moves.
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: alertId, content: content, trigger: trigger))
    }

    // The chosen chime from the web bundle's public/ folder (#828), else the
    // default sound, never silence.
    private static func alertSound(_ file: String) -> UNNotificationSound {
        guard !file.isEmpty, let resources = Bundle.main.resourcePath else { return .default }
        let path = (resources as NSString).appendingPathComponent("public/\(file)")
        guard FileManager.default.fileExists(atPath: path) else { return .default }
        return UNNotificationSound(named: UNNotificationSoundName("public/\(file)"))
    }

    private static func cancelAlert() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [alertId])
        center.removeDeliveredNotifications(withIdentifiers: [alertId])
    }
}

// The Live Activity always shows what RestLiveStore holds: a running rest,
// or nothing. iOS 17 for the buttons (LiveActivityIntent); on iOS 16 the
// plugin still works, with only the end-of-rest alert.
@available(iOS 17.0, *)
@MainActor
enum RestLiveActivity {
    private static var last: Task<Void, Never>?

    static func enqueueSync() {
        let previous = last
        last = Task { @MainActor in
            await previous?.value
            await sync()
        }
    }

    static func sync() async {
        let rest = RestLiveStore.load()
        let activities = Activity<RestActivityAttributes>.activities
        guard let rest, RestLiveStore.isRunning(rest) else {
            for activity in activities { await activity.end(nil, dismissalPolicy: .immediate) }
            return
        }
        let id = RestLiveStore.int(rest, "id")
        let endsAt = Date(timeIntervalSince1970: Double(RestLiveStore.int(rest, "endsAt")) / 1000)
        let state = RestActivityAttributes.ContentState(
            endsAt: endsAt,
            totalSeconds: Int(RestLiveStore.int(rest, "totalSeconds")),
            title: RestLiveStore.string(rest, "title"),
            text: RestLiveStore.string(rest, "text"),
            alertTitle: RestLiveStore.string(rest, "alertTitle")
        )
        // Stale once the rest runs out: the view swaps the countdown for
        // "Rest is over" with no code running at that moment.
        let content = ActivityContent(state: state, staleDate: endsAt)
        var updated = false
        for activity in activities {
            if activity.attributes.restId == id && !updated {
                await activity.update(content)
                updated = true
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        // Only possible while the app is in the foreground, which is where a
        // rest starts; the buttons only ever update an existing one. Not
        // available to app extensions, so the widget build leaves it out.
        #if !RESTLIVE_WIDGET
        guard !updated, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        _ = try? Activity.request(attributes: RestActivityAttributes(restId: id), content: content, pushType: nil)
        #endif
    }
}

@available(iOS 17.0, *)
struct AddRestTimeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Add 15 seconds"
    static var isDiscoverable = false

    func perform() async throws -> some IntentResult {
        if RestLiveStore.addTime() { RestLiveStore.notifyApp("add") }
        await RestLiveActivity.sync()
        return .result()
    }
}

@available(iOS 17.0, *)
struct SkipRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip rest"
    static var isDiscoverable = false

    func perform() async throws -> some IntentResult {
        if RestLiveStore.skip() { RestLiveStore.notifyApp("skip") }
        await RestLiveActivity.sync()
        return .result()
    }
}
