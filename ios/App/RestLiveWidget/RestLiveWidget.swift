import ActivityKit
import SwiftUI
import WidgetKit

// Issue #163 (Premium): the rest timer's Live Activity, on the lock screen
// and in the Dynamic Island. The state comes from RestLiveStore
// (App/RestLiveShared.swift, built into this target too); the buttons run
// its intents in the app's process.

@main
struct RestLiveWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestLiveWidget()
    }
}

// The app's tokens (src/style.css): surface, accent, accent text,
// secondary, text.
private extension Color {
    static let rbSurface = Color(red: 0x21 / 255, green: 0x18 / 255, blue: 0x29 / 255)
    static let rbAccent = Color(red: 0xF2 / 255, green: 0x87 / 255, blue: 0x9C / 255)
    static let rbAccentText = Color(red: 0x24 / 255, green: 0x1A / 255, blue: 0x2C / 255)
    static let rbSecondary = Color(red: 0xB7 / 255, green: 0x9C / 255, blue: 0xF0 / 255)
    static let rbText = Color(red: 0xF5 / 255, green: 0xED / 255, blue: 0xF2 / 255)
}

struct RestLiveWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            RestLockScreenView(state: context.state, isStale: context.isStale)
                .activityBackgroundTint(.rbSurface)
                .activitySystemActionForegroundColor(.rbAccent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.isStale ? context.state.alertTitle : context.state.title, systemImage: "timer")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.rbSecondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if !context.isStale {
                        RestCountdown(state: context.state)
                            .font(.title2.weight(.bold).monospacedDigit())
                            .foregroundStyle(Color.rbAccent)
                            .frame(maxWidth: 90, alignment: .trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(context.state.text)
                            .font(.headline)
                            .foregroundStyle(Color.rbText)
                            .lineLimit(1)
                        if !context.isStale {
                            RestButtons()
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Color.rbAccent)
            } compactTrailing: {
                Group {
                    if context.isStale {
                        Text("0:00")
                    } else {
                        RestCountdown(state: context.state)
                    }
                }
                .monospacedDigit()
                .foregroundStyle(Color.rbAccent)
                .frame(maxWidth: 44, alignment: .trailing)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(Color.rbAccent)
            }
            .keylineTint(.rbAccent)
        }
    }
}

struct RestLockScreenView: View {
    let state: RestActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(isStale ? state.alertTitle : state.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isStale ? Color.rbAccent : Color.rbSecondary)
                    Text(state.text)
                        .font(.headline)
                        .foregroundStyle(Color.rbText)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if !isStale {
                    RestCountdown(state: state)
                        .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(Color.rbAccent)
                        .frame(maxWidth: 120, alignment: .trailing)
                }
            }
            if !isStale {
                ProgressView(timerInterval: state.startsAt...state.endsAt, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .tint(.rbAccent)
                RestButtons()
            }
        }
        .padding(16)
    }
}

// Counts down on its own; the system redraws it every second.
struct RestCountdown: View {
    let state: RestActivityAttributes.ContentState

    var body: some View {
        Text(timerInterval: min(Date(), state.endsAt)...state.endsAt, countsDown: true)
            .multilineTextAlignment(.trailing)
    }
}

struct RestButtons: View {
    var body: some View {
        HStack(spacing: 8) {
            Button(intent: AddRestTimeIntent()) {
                Text("+15s").frame(maxWidth: .infinity)
            }
            .tint(.rbSecondary)
            Button(intent: SkipRestIntent()) {
                Text("Skip").frame(maxWidth: .infinity)
            }
            .tint(.rbAccent)
        }
        .buttonStyle(.borderedProminent)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Color.rbAccentText)
    }
}

private extension RestActivityAttributes.ContentState {
    var startsAt: Date {
        endsAt.addingTimeInterval(-Double(max(totalSeconds, 0)))
    }
}
