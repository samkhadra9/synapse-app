//
//  AiteallWidget.swift
//  Aiteall — Home-screen widget (CP4.1c)
//
//  Shows "the one" — the single most important task for today — and lets
//  the user tap into the app to dump, or to mark the-one done, without
//  navigating through the tab bar.
//
//  Data flow:
//    Main app → UserDefaults(suiteName: "group.com.synapseadhd.app")
//    Widget   → reads the same suite, refreshes on timeline ticks.
//
//  Keys mirror src/services/sharedState.ts:
//    "theOne"       : JSON { id, text, projectName? } | null
//    "lastSyncedAt" : ISO string
//

import WidgetKit
import SwiftUI

// MARK: - Shared data types

struct TheOne: Codable, Hashable {
    let id: String
    let text: String
    let projectName: String?
}

// Reads the latest theOne snapshot the JS layer wrote.
// Returns nil when there is no current the-one, or on JSON decode failure.
func loadTheOne() -> TheOne? {
    guard let defaults = UserDefaults(suiteName: "group.com.synapseadhd.app"),
          let raw = defaults.string(forKey: "theOne"),
          let data = raw.data(using: .utf8) else {
        return nil
    }
    // JSON "null" is a valid value — means "no the-one right now"
    if raw == "null" { return nil }
    return try? JSONDecoder().decode(TheOne.self, from: data)
}

// MARK: - Timeline

struct TheOneEntry: TimelineEntry {
    let date: Date
    let theOne: TheOne?
}

struct TheOneProvider: TimelineProvider {
    // Shown while the widget gallery is rendering the preview
    func placeholder(in context: Context) -> TheOneEntry {
        TheOneEntry(
            date: Date(),
            theOne: TheOne(id: "preview", text: "The one thing for today.", projectName: nil)
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TheOneEntry) -> Void) {
        completion(TheOneEntry(date: Date(), theOne: loadTheOne()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TheOneEntry>) -> Void) {
        // Single-entry timeline, refreshed on a 30-minute cadence. The main
        // app also calls WidgetCenter.shared.reloadAllTimelines() whenever
        // the-one changes, so real-time updates don't depend on this cadence.
        let entry = TheOneEntry(date: Date(), theOne: loadTheOne())
        let refresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }
}

// MARK: - Views

private struct WidgetBackground: View {
    var body: some View {
        // Soft, low-contrast — matches the app's "peace" aesthetic.
        LinearGradient(
            colors: [
                Color(red: 0.98, green: 0.96, blue: 0.93),  // warm cream
                Color(red: 0.95, green: 0.91, blue: 0.86),  // sand
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct LabelText: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.medium))
            .tracking(1.2)
            .foregroundColor(Color.black.opacity(0.42))
    }
}

// Small widget — just the one.
struct TheOneSmallView: View {
    let entry: TheOneEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "The one")
            Spacer(minLength: 0)

            if let t = entry.theOne {
                Text(t.text)
                    .font(.system(size: 16, weight: .regular, design: .serif))
                    .foregroundColor(Color.black.opacity(0.82))
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)
                if let project = t.projectName {
                    Text(project)
                        .font(.caption2)
                        .foregroundColor(Color.black.opacity(0.42))
                        .lineLimit(1)
                }
            } else {
                Text("Nothing chosen.\nTap to talk it out.")
                    .font(.system(size: 15, weight: .regular, design: .serif))
                    .foregroundColor(Color.black.opacity(0.5))
                    .lineLimit(3)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(14)
        .widgetURL(URL(string: "aiteall://chat/dump"))
    }
}

// Medium widget — the one + two actions.
struct TheOneMediumView: View {
    let entry: TheOneEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LabelText(text: "The one")

            if let t = entry.theOne {
                Text(t.text)
                    .font(.system(size: 18, weight: .regular, design: .serif))
                    .foregroundColor(Color.black.opacity(0.85))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                if let project = t.projectName {
                    Text(project)
                        .font(.caption)
                        .foregroundColor(Color.black.opacity(0.45))
                        .lineLimit(1)
                }
            } else {
                Text("Nothing chosen yet.")
                    .font(.system(size: 17, weight: .regular, design: .serif))
                    .foregroundColor(Color.black.opacity(0.5))
            }

            Spacer(minLength: 0)

            // Two tappable deep links. Each is a Link in SwiftUI, which the
            // widget picks up as a target for taps inside medium-size widgets.
            HStack(spacing: 8) {
                Link(destination: URL(string: "aiteall://chat/dump")!) {
                    WidgetPill(label: "Dump", icon: "text.bubble")
                }
                Link(destination: URL(string: "aiteall://the-one/done")!) {
                    WidgetPill(label: "Done", icon: "checkmark.circle")
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(14)
    }
}

private struct WidgetPill: View {
    let label: String
    let icon: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
            Text(label)
                .font(.system(size: 13, weight: .medium))
        }
        .foregroundColor(Color.black.opacity(0.75))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.6))
        )
    }
}

// MARK: - Widget declarations

struct TheOneWidget: Widget {
    let kind: String = "TheOneWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TheOneProvider()) { entry in
            TheOneWidgetEntryView(entry: entry)
                .widgetBackgroundCompat { WidgetBackground() }
        }
        .configurationDisplayName("The one")
        .description("Your single most important thing, one tap to chat.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - iOS 16/17 background compat
//
// iOS 17 introduced `.containerBackground(for: .widget) { ... }` as the
// official way to paint widget backgrounds — older `.background()` gets
// cropped in StandBy / tinted modes. But the modifier and the `.widget`
// case are iOS 17 only, so we have to gate them with #available.
extension View {
    @ViewBuilder
    func widgetBackgroundCompat<B: View>(@ViewBuilder _ background: () -> B) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { background() }
        } else {
            self.background(background())
        }
    }
}

struct TheOneWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: TheOneEntry

    var body: some View {
        switch family {
        case .systemSmall:  TheOneSmallView(entry: entry)
        default:            TheOneMediumView(entry: entry)
        }
    }
}

// MARK: - Widget bundle

@main
struct AiteallWidgetBundle: WidgetBundle {
    var body: some Widget {
        TheOneWidget()
        // Live Activity widget is declared here too. Its source lives in
        // LiveActivity.swift in this same target so WidgetKit discovers it.
        if #available(iOS 16.1, *) {
            FifteenLiveActivity()
        }
    }
}
