import Capacitor
import Foundation
import UIKit
import UniformTypeIdentifiers

// Issue #432: the web layer's handle on the folder the automatic copy goes to
// (src/lib/backupFolder.ts), the same contract as Android's
// BackupFolderPlugin.java. The person picks a folder in the Files picker;
// a bookmark kept in UserDefaults reopens it on later launches, and every
// access is wrapped in start/stopAccessingSecurityScopedResource. Writes go
// through NSFileCoordinator so iCloud Drive syncs them. Registered in
// MainViewController.
// Issue #874: with no folder picked, every call uses the default folder the
// app picks, so the copy is on with no question: the app's own iCloud Drive
// container (iCloud Drive › RepBunny in Files, App.entitlements and
// NSUbiquitousContainers in Info.plist), or a folder in the app's own storage
// when iCloud is off or signed out. That one isn't shown in Files: the SQLite
// database lives in Documents, and file sharing would show it there too.
// Capacitor calls these off the main thread, which the container lookup needs.
@objc(BackupFolderPlugin)
public class BackupFolderPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "BackupFolderPlugin"
    public let jsName = "BackupFolder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "useDefault", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    private static let bookmarkKey = "BackupFolderBookmark"
    private static let containerId = "iCloud.app.repbunny"
    private var pickCall: CAPPluginCall?

    @objc func pick(_ call: CAPPluginCall) {
        // Opens at the default folder, where a new install finds an old one's copies.
        let start = defaultFolder().url
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else { return call.reject("Can't show the folder picker") }
            self.pickCall?.reject("Folder pick cancelled")
            self.pickCall = call
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            picker.delegate = self
            picker.allowsMultipleSelection = false
            picker.directoryURL = start
            presenter.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickCall else { return }
        pickCall = nil
        guard let url = urls.first else { return call.reject("Folder pick cancelled") }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(bookmark, forKey: BackupFolderPlugin.bookmarkKey)
            call.resolve(info(url))
        } catch {
            call.reject("That folder can't be kept", nil, error)
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickCall?.reject("Folder pick cancelled")
        pickCall = nil
    }

    // Forgets a picked folder; every call then uses the default one.
    @objc func useDefault(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: BackupFolderPlugin.bookmarkKey)
        let folder = defaultFolder()
        call.resolve(defaultInfo(folder))
    }

    @objc func status(_ call: CAPPluginCall) {
        guard let url = folder() else {
            let folder = defaultFolder()
            var result = defaultInfo(folder)
            result["reachable"] = (try? folder.url.checkResourceIsReachable()) ?? false
            return call.resolve(result)
        }
        let reachable = access(url) { (try? url.checkResourceIsReachable()) ?? false }
        var result = info(url)
        result["reachable"] = reachable
        call.resolve(result)
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let text = call.getString("text") else { return call.reject("No file name or contents") }
        let url = folder() ?? defaultFolder().url
        let file = url.appendingPathComponent(name)
        var failure: Error?
        access(url) {
            var coordinationError: NSError?
            NSFileCoordinator().coordinate(writingItemAt: file, options: .forReplacing, error: &coordinationError) { target in
                do {
                    try Data(text.utf8).write(to: target, options: .atomic)
                } catch {
                    failure = error
                }
            }
            if let coordinationError = coordinationError { failure = coordinationError }
        }
        if let failure = failure { return call.reject("Couldn't save to the backup folder", nil, failure) }
        call.resolve()
    }

    // Issue #871: reads a file already in the folder, so a copy there can be
    // kept under another name before the first save replaces it.
    @objc func read(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { return call.reject("No file name") }
        let url = folder() ?? defaultFolder().url
        let file = url.appendingPathComponent(name)
        var text: String?
        var failure: Error?
        access(url) {
            // A coordinated read of an iCloud file waits for its download.
            if FileManager.default.isUbiquitousItem(at: file) { try? FileManager.default.startDownloadingUbiquitousItem(at: file) }
            var coordinationError: NSError?
            NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: &coordinationError) { target in
                do {
                    text = try String(contentsOf: target, encoding: .utf8)
                } catch {
                    failure = error
                }
            }
            if let coordinationError = coordinationError { failure = coordinationError }
        }
        if let failure = failure { return call.reject("Couldn't read the backup folder", nil, failure) }
        guard let text = text else { return call.reject("Couldn't read the backup folder") }
        call.resolve(["text": text])
    }

    @objc func list(_ call: CAPPluginCall) {
        let url = folder() ?? defaultFolder().url
        var files: [[String: Any]] = []
        var failure: Error?
        access(url) {
            do {
                let names = try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: [.contentModificationDateKey])
                for file in names {
                    var name = file.lastPathComponent
                    // An iCloud file not downloaded to this phone yet (a new
                    // install's) shows as ".<name>.icloud". List it by its own
                    // name and start the download; read waits for it.
                    if name.hasPrefix("."), name.hasSuffix(".icloud") {
                        name = String(name.dropFirst().dropLast(".icloud".count))
                        try? FileManager.default.startDownloadingUbiquitousItem(at: url.appendingPathComponent(name))
                    } else if name.hasPrefix(".") {
                        continue
                    }
                    let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? nil
                    files.append(["name": name, "modified": (modified?.timeIntervalSince1970 ?? 0) * 1000])
                }
            } catch {
                failure = error
            }
        }
        if let failure = failure { return call.reject("Couldn't read the backup folder", nil, failure) }
        call.resolve(["files": files])
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { return call.reject("No file name") }
        let url = folder() ?? defaultFolder().url
        let file = url.appendingPathComponent(name)
        var failure: Error?
        access(url) {
            var coordinationError: NSError?
            NSFileCoordinator().coordinate(writingItemAt: file, options: .forDeleting, error: &coordinationError) { target in
                do {
                    if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
                } catch {
                    failure = error
                }
            }
            if let coordinationError = coordinationError { failure = coordinationError }
        }
        if let failure = failure { return call.reject("Couldn't remove the old copy", nil, failure) }
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: BackupFolderPlugin.bookmarkKey)
        call.resolve()
    }

    // The saved folder, refreshing a stale bookmark while access still works.
    private func folder() -> URL? {
        guard let bookmark = UserDefaults.standard.data(forKey: BackupFolderPlugin.bookmarkKey) else { return nil }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        if stale {
            access(url) {
                if let fresh = try? url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) {
                    UserDefaults.standard.set(fresh, forKey: BackupFolderPlugin.bookmarkKey)
                }
            }
        }
        return url
    }

    @discardableResult
    private func access<T>(_ url: URL, _ body: () -> T) -> T {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        return body()
    }

    // The app's iCloud Drive folder when iCloud is on, else a folder in its
    // own storage, created if needed. Looked up each time, so a phone that signs
    // out of iCloud falls back, and the web layer's status says so.
    private func defaultFolder() -> (url: URL, iCloud: Bool) {
        let files = FileManager.default
        if let container = files.url(forUbiquityContainerIdentifier: BackupFolderPlugin.containerId) {
            let documents = container.appendingPathComponent("Documents", isDirectory: true)
            if (try? files.createDirectory(at: documents, withIntermediateDirectories: true)) != nil {
                return (documents, true)
            }
        }
        let local = files.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Automatic copy", isDirectory: true)
        try? files.createDirectory(at: local, withIntermediateDirectories: true)
        return (local, false)
    }

    private func defaultInfo(_ folder: (url: URL, iCloud: Bool)) -> [String: Any] {
        return [
            "name": folder.iCloud ? "iCloud Drive › RepBunny" : "RepBunny's folder on this iPhone",
            "local": !folder.iCloud,
        ]
    }

    private func info(_ url: URL) -> [String: Any] {
        return ["name": url.lastPathComponent, "local": !FileManager.default.isUbiquitousItem(at: url)]
    }
}
