import SwiftUI
import WidgetKit

@main
struct AniLoungeWidgetsBundle: WidgetBundle {
    var body: some Widget {
        WatchlistUpdatesWidget()
        RecentReleasesWidget()
    }
}

// MARK: - Watchlist updates

/// Your and your friends' latest watchlist changes (the home page's Status feed).
struct WatchlistUpdatesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WatchlistUpdates", provider: FeedProvider()) { entry in
            WatchlistUpdatesView(entry: entry)
                .containerBackground(Palette.background, for: .widget)
        }
        .configurationDisplayName("Watchlist updates")
        .description("What you and your friends are watching.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct WatchlistUpdatesView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FeedEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(
                title: family == .systemSmall ? "Watchlist" : "Watchlist updates",
                symbol: "person.2.fill"
            )
            if let feed = entry.feed, feed.signedIn {
                if feed.activity.isEmpty {
                    Note("Nothing yet. Update your watchlist or add friends to see activity here.")
                } else {
                    ForEach(feed.activity.prefix(rowLimit(family))) { item in
                        RowLink(path: item.path, family: family) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(item.who) \(item.did)")
                                    .font(.caption2)
                                    .foregroundStyle(Palette.muted)
                                    .lineLimit(1)
                                HStack(spacing: 4) {
                                    Text(item.title)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(Palette.text)
                                        .lineLimit(1)
                                    // Small widgets give the title the whole row.
                                    if family != .systemSmall {
                                        Spacer(minLength: 2)
                                        Text(ago(item.at, now: entry.date))
                                            .font(.caption2)
                                            .foregroundStyle(Palette.muted)
                                    }
                                }
                            }
                        }
                    }
                }
            } else if entry.unavailable {
                Note("Couldn't load updates. Check your connection.")
            } else {
                Note("Open AniLounge and sign in to see your watchlist updates.")
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetShared.appURL(path: "/"))
    }
}

// MARK: - Recent releases

/// New episodes and premieres for your watchlist (trending ones when signed out).
struct RecentReleasesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RecentReleases", provider: FeedProvider()) { entry in
            RecentReleasesView(entry: entry)
                .containerBackground(Palette.background, for: .widget)
        }
        .configurationDisplayName("Recent releases")
        .description("New episodes and premieres from your watchlist.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct RecentReleasesView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FeedEntry

    var body: some View {
        let releases = entry.feed?.releases
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(title: releasesTitle(releases?.source), symbol: "sparkles.tv.fill")
            if let items = releases?.items, !items.isEmpty {
                ForEach(items.prefix(rowLimit(family))) { item in
                    RowLink(path: item.path, family: family) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(item.title)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Palette.text)
                                .lineLimit(1)
                            Text(timing(item, now: entry.date))
                                .font(.caption2)
                                .foregroundStyle(isOut(item, now: entry.date) ? Palette.accent : Palette.muted)
                                .lineLimit(1)
                        }
                    }
                }
            } else if entry.unavailable {
                Note("Couldn't load releases. Check your connection.")
            } else {
                Note("No new releases right now.")
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetShared.appURL(path: releases?.items.first?.path ?? "/"))
    }

    private func releasesTitle(_ source: String?) -> String {
        if family == .systemSmall { return source == "trending" ? "Trending" : "Releases" }
        return source == "trending" ? "Trending releases" : "Recent releases"
    }

    private func isOut(_ item: WidgetFeed.Release, now: Date) -> Bool {
        guard let at = item.at else { return false }
        return at <= now
    }

    /// e.g. "Ep 12 · out 2h ago", "Ep 5 · in 3d", "Premieres Oct 14".
    private func timing(_ item: WidgetFeed.Release, now: Date) -> String {
        if item.kind == "episode" {
            let episode = item.episode.map { "Ep \($0)" } ?? "New episode"
            guard let at = item.at else { return "\(episode) · airs weekly" }
            return at <= now ? "\(episode) · out \(ago(at, now: now))" : "\(episode) · in \(until(at, now: now))"
        }
        guard let at = item.at else { return "Premiere date TBA" }
        if at <= now { return "Out now" }
        return "Premieres \(at.formatted(.dateTime.month(.abbreviated).day()))"
    }
}

// MARK: - Shared pieces

enum Palette {
    static let background = Color(red: 15 / 255, green: 23 / 255, blue: 38 / 255)
    static let accent = Color(red: 224 / 255, green: 122 / 255, blue: 95 / 255)
    static let text = Color.white
    static let muted = Color.white.opacity(0.62)
}

/// Rows that fit each size.
func rowLimit(_ family: WidgetFamily) -> Int {
    switch family {
    case .systemSmall: return 2
    case .systemLarge: return 7
    default: return 3
    }
}

/// "5m ago" style, measured from the entry's date.
func ago(_ date: Date, now: Date) -> String {
    let seconds = max(0, now.timeIntervalSince(date))
    return "\(short(seconds)) ago"
}

/// "3h" style time until `date`.
func until(_ date: Date, now: Date) -> String {
    short(max(0, date.timeIntervalSince(now)))
}

private func short(_ seconds: TimeInterval) -> String {
    let minutes = Int(seconds / 60)
    if minutes < 1 { return "now" }
    if minutes < 60 { return "\(minutes)m" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h" }
    return "\(hours / 24)d"
}

struct WidgetHeader: View {
    let title: String
    let symbol: String

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.caption.weight(.bold))
            .foregroundStyle(Palette.accent)
            .lineLimit(1)
    }
}

struct Note: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Palette.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A row that opens its page. Small widgets can't hold links, so there the whole
/// widget opens one page instead (`widgetURL`).
struct RowLink<Content: View>: View {
    let path: String
    let family: WidgetFamily
    @ViewBuilder let content: Content

    var body: some View {
        if family == .systemSmall {
            content
        } else {
            Link(destination: WidgetShared.appURL(path: path)) { content }
        }
    }
}
