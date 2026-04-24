//
//  AiteallNativeModule.swift
//  AiteallNative — JS ↔ native bridge for Live Activity + widget reloads.
//
//  JS-callable surface:
//
//    startFifteen(label, durationSeconds)  → starts a Live Activity
//    updateFifteen(label?)                 → pushes a new ContentState
//    endFifteen()                          → dismisses the activity
//    reloadWidget()                        → nudges WidgetCenter to refresh
//
//  If the device is below iOS 16.1 or Live Activities are disabled in
//  Settings, the start call no-ops cleanly and returns false.
//

import ExpoModulesCore
import ActivityKit
import WidgetKit

public class AiteallNativeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("AiteallNative")

        // MARK: Live Activity — start
        AsyncFunction("startFifteen") { (label: String, durationSeconds: Double) -> Bool in
            guard #available(iOS 16.1, *) else { return false }
            // End any in-flight activities first — we only allow one.
            await endAllActivities()

            let now = Date()
            let endsAt = now.addingTimeInterval(durationSeconds)
            let attributes = FifteenAttributes(startedAt: now)
            let initialState = FifteenAttributes.ContentState(endsAt: endsAt, label: label)

            do {
                if #available(iOS 16.2, *) {
                    _ = try Activity.request(
                        attributes: attributes,
                        content: .init(state: initialState, staleDate: endsAt.addingTimeInterval(60)),
                        pushType: nil
                    )
                } else {
                    _ = try Activity.request(
                        attributes: attributes,
                        contentState: initialState,
                        pushType: nil
                    )
                }
                return true
            } catch {
                return false
            }
        }

        // MARK: Live Activity — update
        AsyncFunction("updateFifteen") { (label: String) -> Bool in
            guard #available(iOS 16.1, *) else { return false }
            for activity in Activity<FifteenAttributes>.activities {
                let state = FifteenAttributes.ContentState(
                    endsAt: activity.contentState.endsAt,
                    label: label
                )
                if #available(iOS 16.2, *) {
                    await activity.update(.init(state: state, staleDate: nil))
                } else {
                    await activity.update(using: state)
                }
            }
            return true
        }

        // MARK: Live Activity — end
        AsyncFunction("endFifteen") { () -> Bool in
            guard #available(iOS 16.1, *) else { return false }
            await endAllActivities()
            return true
        }

        // MARK: Widget — manual refresh
        Function("reloadWidget") { () -> Void in
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    @available(iOS 16.1, *)
    private func endAllActivities() async {
        for activity in Activity<FifteenAttributes>.activities {
            if #available(iOS 16.2, *) {
                await activity.end(nil, dismissalPolicy: .immediate)
            } else {
                await activity.end(dismissalPolicy: .immediate)
            }
        }
    }
}
