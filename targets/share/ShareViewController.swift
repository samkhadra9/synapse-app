//
//  ShareViewController.swift
//  Aiteall — Share Extension (CP4.2a)
//
//  Triggered from the iOS share sheet. Reads whatever was shared (URL
//  or text), writes it to the shared App Group as the pending seed,
//  then opens the main app via aiteall:// so ChatScreen can pick up
//  the seed on mount.
//
//  We deliberately skip any custom UI — the share sheet's default
//  compose view would slow this down (the whole point is capture in
//  <1s). The extension flashes open and redirects. If the user needs
//  to edit, they can do so in the dump chat once the app opens.
//

import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices

let APP_GROUP_ID = "group.com.synapseadhd.app"
let AITEALL_SCHEME = "aiteall"

class ShareViewController: SLComposeServiceViewController {

    // Prevent the default compose UI — we want zero-friction capture.
    override func isContentValid() -> Bool { true }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await extractAndForward() }
    }

    // Main flow: walk the extension item attachments, pull out text /
    // URL payloads, write them to App Group, open the main app.
    private func extractAndForward() async {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else {
            complete()
            return
        }

        var seed: String? = nil

        for attachment in attachments {
            // Prefer URL (shared from Safari) — it's the most common.
            if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let payload = try? await attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil),
                   let url = payload as? URL {
                    seed = url.absoluteString
                    break
                }
            }
            // Plain text (selected text, or Share from a note app)
            if attachment.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                if let payload = try? await attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil),
                   let text = payload as? String {
                    seed = text
                    break
                }
            }
        }

        // Include the user-typed note from the share sheet compose field,
        // if any — SLComposeServiceViewController exposes it as .contentText.
        let composed = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !composed.isEmpty {
            seed = composed + (seed.map { "\n\n" + $0 } ?? "")
        }

        // Persist to App Group so the app can pick it up even if deep link
        // payload is truncated.
        if let seed = seed {
            UserDefaults(suiteName: APP_GROUP_ID)?.set(seed, forKey: "pendingShareSeed")
        }

        await MainActor.run {
            openMainApp(with: seed)
            complete()
        }
    }

    // Build the aiteall:// URL and open it. Extensions can't call
    // UIApplication.shared.open directly — they have to walk up the
    // responder chain until they find something that can.
    private func openMainApp(with seed: String?) {
        var components = URLComponents()
        components.scheme = AITEALL_SCHEME
        components.host = "chat"
        components.path = "/dump"
        if let seed = seed, !seed.isEmpty {
            components.queryItems = [URLQueryItem(name: "seed", value: seed)]
        }
        guard let url = components.url else { return }

        var responder: UIResponder? = self
        while let r = responder {
            // iOS 18+ selector
            if let app = r as? UIApplication {
                app.open(url, options: [:], completionHandler: nil)
                return
            }
            // Fallback for older iOS versions — openURL: on any responder
            // that implements it. NSSelectorFromString (vs Selector("...")
            // string literal) silences the "use #selector" compiler warning,
            // which doesn't apply here because we're probing for an ObjC
            // method that isn't declared in Swift scope.
            let openSel = NSSelectorFromString("openURL:")
            if r.responds(to: openSel) {
                _ = r.perform(openSel, with: url)
                return
            }
            responder = r.next
        }
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    // We don't want to show the default compose UI. Override the sheet
    // configuration to present nothing.
    override func configurationItems() -> [Any]! { [] }
}
