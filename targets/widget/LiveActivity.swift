//
//  LiveActivity.swift
//  Aiteall — 15-minute opener lock-screen pin (CP4.3)
//
//  When the user starts a 15-minute focus session, the main app calls
//  ActivityKit to start an activity with the end-time. iOS pins it on
//  the lock screen and in the dynamic island with a gentle countdown.
//  Tap the pill → deep-link back to aiteall://deep-work.
//
//  The activity attribute / content-state shape is mirrored on the JS
//  side in src/services/liveActivity.ts — keep them in sync.
//

import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Attributes (static + dynamic shape)

@available(iOS 16.1, *)
public struct FifteenAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Scheduled end time. Swift computes remaining from Date() vs this.
        public let endsAt: Date
        /// User-facing label — usually the-one text, or "15 minutes".
        public let label: String

        public init(endsAt: Date, label: String) {
            self.endsAt = endsAt
            self.label = label
        }
    }

    /// Start time, fixed for the activity's lifetime (we don't restart a
    /// running session; when it ends we end the activity and start a new one).
    public let startedAt: Date

    public init(startedAt: Date) {
        self.startedAt = startedAt
    }
}

// MARK: - Widget

@available(iOS 16.1, *)
struct FifteenLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FifteenAttributes.self) { context in
            // Lock-screen presentation.
            LockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.98, green: 0.96, blue: 0.93))
                .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded regions
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "circle.dashed")
                        .foregroundColor(.black.opacity(0.7))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...context.state.endsAt, countsDown: true)
                        .font(.title3.monospacedDigit())
                        .foregroundColor(.black.opacity(0.8))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.label)
                        .font(.caption)
                        .foregroundColor(.black.opacity(0.6))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) { EmptyView() }
            } compactLeading: {
                Image(systemName: "circle.dashed")
            } compactTrailing: {
                Text(timerInterval: Date()...context.state.endsAt, countsDown: true)
                    .font(.caption2.monospacedDigit())
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "circle.dashed")
            }
            .widgetURL(URL(string: "aiteall://deep-work"))
        }
    }
}

@available(iOS 16.1, *)
private struct LockScreenView: View {
    let context: ActivityViewContext<FifteenAttributes>

    var body: some View {
        HStack(spacing: 14) {
            // Soft timer ring — uses a progress derived from start/end.
            ProgressRing(
                startedAt: context.attributes.startedAt,
                endsAt: context.state.endsAt
            )
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text("15 minutes")
                    .font(.caption.weight(.medium))
                    .foregroundColor(.black.opacity(0.55))
                Text(context.state.label)
                    .font(.system(.body, design: .serif))
                    .foregroundColor(.black.opacity(0.85))
                    .lineLimit(1)
            }

            Spacer()

            Text(timerInterval: Date()...context.state.endsAt, countsDown: true)
                .font(.title3.monospacedDigit())
                .foregroundColor(.black.opacity(0.8))
        }
        .padding(14)
    }
}

@available(iOS 16.1, *)
private struct ProgressRing: View {
    let startedAt: Date
    let endsAt: Date

    var body: some View {
        // Progress doesn't auto-animate in a Live Activity (system pushes
        // state updates at most every minute or so); we render what we can.
        let now = Date()
        let total = max(endsAt.timeIntervalSince(startedAt), 1)
        let elapsed = min(max(now.timeIntervalSince(startedAt), 0), total)
        let progress = elapsed / total

        ZStack {
            Circle()
                .stroke(Color.black.opacity(0.08), lineWidth: 3)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color.black.opacity(0.6), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}
