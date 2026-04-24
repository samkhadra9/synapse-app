//
//  TellAiteallIntent.swift
//  AiteallNative — Siri Shortcut via AppIntents (CP4.2b)
//
//  User: "Hey Siri, tell Aiteall I'm spiralling on the Cohen deal"
//   →  Siri runs `TellAiteallIntent` with `message = "I'm spiralling…"`
//   →  The intent opens aiteall://chat/dump?seed=<text>
//   →  The app opens a dump chat with that as the first user message.
//
//  Because `openAppWhenRun = true` and we set openIntentURL, iOS treats
//  the intent as "launch the app to handle this" rather than executing
//  in the background. That's what we want — the whole point is to land
//  the user in chat.
//

import AppIntents
import Foundation

@available(iOS 16.0, *)
public struct TellAiteallIntent: AppIntent {
    public static var title: LocalizedStringResource = "Tell Aiteall"
    public static var description = IntentDescription("Open Aiteall with a message to dump.")

    // When true, invoking the intent from Siri opens the app.
    public static var openAppWhenRun: Bool = true

    @Parameter(title: "Message", description: "What you want to tell Aiteall.")
    public var message: String

    public init() {}
    public init(message: String) {
        self.message = message
    }

    // Required phrase the user can say. The `\(\.$message)` slot captures
    // the free-form text after "tell Aiteall".
    public static var parameterSummary: some ParameterSummary {
        Summary("Tell Aiteall \(\.$message)")
    }

    public func perform() async throws -> some IntentResult & OpensIntent {
        // Build the deep link. URL encoding matters — commas and
        // punctuation must round-trip cleanly.
        var components = URLComponents()
        components.scheme = "aiteall"
        components.host = "chat"
        components.path = "/dump"
        components.queryItems = [URLQueryItem(name: "seed", value: message)]

        guard let url = components.url else {
            return .result()
        }

        // On iOS 16+, returning a .result(opensIntent:) with a URL pops
        // the app open with that URL as the launch target. Combined with
        // openAppWhenRun, Siri routes us through the app's URL handler.
        //
        // We use EmptyIntent()'s OpensIntent conformance via a helper.
        return .result(opensIntent: OpenURLIntent(url))
    }
}

// A tiny AppIntent whose sole job is to open a URL. AppIntents provides
// one of these built-in (`OpenURLIntent`) on iOS 17+, but we re-declare
// for compatibility back to iOS 16.0.
@available(iOS 16.0, *)
public struct OpenURLIntent: AppIntent {
    public static var title: LocalizedStringResource = "Open URL"
    public static var openAppWhenRun: Bool = true
    public static var isDiscoverable: Bool = false

    public var url: URL

    public init() { self.url = URL(string: "aiteall://")! }
    public init(_ url: URL) { self.url = url }

    public func perform() async throws -> some IntentResult {
        // Best-effort: ask iOS to open the URL. This tends to succeed
        // only when the invoking context is foreground; if Siri has
        // already transitioned us to the app, this is redundant
        // harmless no-op.
        #if canImport(UIKit)
        await MainActor.run {
            if let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                scene.open(url, options: nil, completionHandler: nil)
            }
        }
        #endif
        return .result()
    }
}

#if canImport(UIKit)
import UIKit
#endif

// MARK: - App Shortcuts (donates the phrase to the system)

@available(iOS 16.0, *)
public struct AiteallAppShortcuts: AppShortcutsProvider {
    public static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TellAiteallIntent(),
            phrases: [
                "Tell \(.applicationName)",
                "Dump to \(.applicationName)",
            ],
            shortTitle: "Tell Aiteall",
            systemImageName: "text.bubble"
        )
    }
}
