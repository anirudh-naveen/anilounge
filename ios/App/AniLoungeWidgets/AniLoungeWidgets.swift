import SwiftUI
import WidgetKit

@main
struct AniLoungeWidgetsBundle: WidgetBundle {
    var body: some Widget {
        WatchlistUpdatesWidget()
        RecentReleasesWidget()
    }
}

/// How much each widget shows at each size.
enum WidgetLayout {
    /// Text rows in the small Watchlist widget.
    static let smallRows = 2
    /// Poster tiles across a medium widget.
    static let shelfTiles = 4
    /// Poster rows in a large widget.
    static let largeRows = 6

    /// Posters to download for a widget (the rest of the view is text).
    static func posterCount(kind: WidgetKind, family: WidgetFamily) -> Int {
        switch family {
        case .systemSmall: kind == .releases ? 1 : 0
        case .systemMedium: shelfTiles
        default: largeRows
        }
    }
}

// MARK: - Watchlist updates

/// Your and your friends' latest watchlist changes (the home page's Status feed).
struct WatchlistUpdatesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WatchlistUpdates", provider: FeedProvider(kind: .watchlist)) { entry in
            WatchlistUpdatesView(entry: entry)
                .containerBackground(entry.theme.background, for: .widget)
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
        let theme = entry.theme
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(
                title: family == .systemSmall ? "Watchlist" : "Watchlist updates",
                symbol: "person.2.fill",
                theme: theme
            )
            if let feed = entry.feed, feed.signedIn {
                if feed.activity.isEmpty {
                    Note("Nothing yet. Update your watchlist or add friends to see activity here.", theme: theme)
                } else {
                    content(feed.activity, theme: theme)
                }
            } else if entry.unavailable {
                Note("Couldn't load updates. Check your connection.", theme: theme)
            } else {
                Note("Open AniLounge and sign in to see your watchlist updates.", theme: theme)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetShared.appURL(path: "/"))
    }

    @ViewBuilder
    private func content(_ activity: [WidgetFeed.Activity], theme: WidgetTheme) -> some View {
        switch family {
        case .systemSmall:
            ForEach(activity.prefix(WidgetLayout.smallRows)) { item in
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(item.who) \(item.did)")
                        .font(.caption2)
                        .foregroundStyle(theme.muted)
                        .lineLimit(1)
                    Text(item.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                }
            }
        case .systemMedium:
            PosterShelf(
                tiles: activity.prefix(WidgetLayout.shelfTiles).map { item in
                    ShelfTile(
                        id: item.id,
                        path: item.path,
                        title: item.title,
                        detail: "\(item.who) · \(ago(item.at, now: entry.date))",
                        highlighted: false
                    )
                },
                posters: entry.posters,
                theme: theme
            )
        default:
            ForEach(activity.prefix(WidgetLayout.largeRows)) { item in
                RowLink(path: item.path, family: family) {
                    PosterRow(
                        image: entry.posters[item.id],
                        line1: "\(item.who) \(item.did)",
                        line2: item.title,
                        trailing: ago(item.at, now: entry.date),
                        theme: theme
                    )
                }
            }
        }
    }
}

// MARK: - Recent releases

/// New episodes and premieres for your watchlist (trending ones when signed out).
struct RecentReleasesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RecentReleases", provider: FeedProvider(kind: .releases)) { entry in
            RecentReleasesView(entry: entry)
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
        let items = releases?.items ?? []
        if family == .systemSmall, let featured = items.first {
            FeaturedRelease(
                item: featured,
                image: entry.posters[featured.id],
                theme: entry.theme,
                now: entry.date
            )
        } else {
            list(items, source: releases?.source)
                .containerBackground(entry.theme.background, for: .widget)
        }
    }

    private func list(_ items: [WidgetFeed.Release], source: String?) -> some View {
        let theme = entry.theme
        return VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(title: releasesTitle(source), symbol: "sparkles.tv.fill", theme: theme)
            if !items.isEmpty {
                switch family {
                case .systemMedium:
                    PosterShelf(
                        tiles: items.prefix(WidgetLayout.shelfTiles).map { item in
                            ShelfTile(
                                id: item.id,
                                path: item.path,
                                title: item.title,
                                detail: releaseTiming(item, now: entry.date, short: true),
                                highlighted: isOut(item, now: entry.date)
                            )
                        },
                        posters: entry.posters,
                        theme: theme
                    )
                default:
                    ForEach(items.prefix(WidgetLayout.largeRows)) { item in
                        RowLink(path: item.path, family: family) {
                            PosterRow(
                                image: entry.posters[item.id],
                                line1: nil,
                                line2: item.title,
                                detail: releaseTiming(item, now: entry.date, short: false),
                                detailHighlighted: isOut(item, now: entry.date),
                                theme: theme
                            )
                        }
                    }
                }
            } else if entry.unavailable {
                Note("Couldn't load releases. Check your connection.", theme: theme)
            } else {
                Note("No new releases right now.", theme: theme)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetShared.appURL(path: items.first?.path ?? "/"))
    }

    private func releasesTitle(_ source: String?) -> String {
        source == "trending" ? "Trending releases" : "Recent releases"
    }
}

/// The small Recent releases widget: one title, its poster filling the widget.
struct FeaturedRelease: View {
    let item: WidgetFeed.Release
    let image: UIImage?
    let theme: WidgetTheme
    let now: Date

    var body: some View {
        // Over a poster the text is white on a dark fade; without one it uses the theme.
        let onImage = image != nil
        VStack(alignment: .leading, spacing: 2) {
            Spacer(minLength: 0)
            Text(label)
                .font(.caption2.weight(.bold))
                .foregroundStyle(theme.accent)
                .textCase(.uppercase)
            Text(item.title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(onImage ? .white : theme.text)
                .lineLimit(2)
            Text(detail)
                .font(.caption2)
                .foregroundStyle(onImage ? Color.white.opacity(0.85) : theme.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .containerBackground(for: .widget) {
            if let image {
                ZStack {
                    Image(uiImage: image).resizable().scaledToFill()
                    // Dark enough at the bottom for the label and title over any poster.
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0.15),
                            .init(color: .black.opacity(0.6), location: 0.5),
                            .init(color: .black.opacity(0.92), location: 1),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
            } else {
                theme.background
            }
        }
        .widgetURL(WidgetShared.appURL(path: item.path))
    }

    private var out: Bool { isOut(item, now: now) }

    private var label: String {
        if item.kind == "episode" { return out ? "New episode" : "Next episode" }
        return out ? "Just released" : "Coming soon"
    }

    /// Shows say which episode; movies and other premieres just say when.
    private var detail: String {
        if item.kind == "episode" {
            let episode = item.episode.map { "Episode \($0)" } ?? "New episode"
            guard let at = item.at else { return "\(episode) · weekly" }
            return out ? "\(episode) · \(ago(at, now: now))" : "\(episode) · in \(until(at, now: now))"
        }
        guard let at = item.at else { return "Date TBA" }
        return out ? "Released \(ago(at, now: now))" : at.formatted(.dateTime.month(.abbreviated).day())
    }
}

// MARK: - Shared pieces

/// Whether a release has come out by `now`.
func isOut(_ item: WidgetFeed.Release, now: Date) -> Bool {
    guard let at = item.at else { return false }
    return at <= now
}

/// e.g. "Ep 12 · out 2h ago", "Ep 5 · in 3d", "Premieres Oct 14"; `short` for poster tiles.
func releaseTiming(_ item: WidgetFeed.Release, now: Date, short: Bool) -> String {
    if item.kind == "episode" {
        let episode = item.episode.map { "Ep \($0)" } ?? "New ep"
        guard let at = item.at else { return short ? episode : "\(episode) · airs weekly" }
        if at <= now { return short ? "\(episode) · \(ago(at, now: now))" : "\(episode) · out \(ago(at, now: now))" }
        return "\(episode) · in \(until(at, now: now))"
    }
    guard let at = item.at else { return short ? "TBA" : "Premiere date TBA" }
    if at <= now { return "Out now" }
    let date = at.formatted(.dateTime.month(.abbreviated).day())
    return short ? date : "Premieres \(date)"
}

/// "5m ago" style, measured from the entry's date.
func ago(_ date: Date, now: Date) -> String {
    let seconds = max(0, now.timeIntervalSince(date))
    let text = short(seconds)
    return text == "now" ? "just now" : "\(text) ago"
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
    let theme: WidgetTheme

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.caption.weight(.bold))
            .foregroundStyle(theme.accent)
            .lineLimit(1)
    }
}

struct Note: View {
    let text: String
    let theme: WidgetTheme

    init(_ text: String, theme: WidgetTheme) {
        self.text = text
        self.theme = theme
    }

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(theme.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A poster, or a placeholder in the theme's surface color when there's no image.
struct PosterImage: View {
    let image: UIImage?
    let width: CGFloat
    let height: CGFloat
    let theme: WidgetTheme

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ZStack {
                    theme.surface
                    Image(systemName: "film").font(.caption).foregroundStyle(theme.muted)
                }
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

struct ShelfTile: Identifiable {
    let id: String
    let path: String
    let title: String
    let detail: String
    /// Show the detail in the accent color (e.g. an episode that's out).
    let highlighted: Bool
}

/// Medium widgets: posters side by side, each with a title and a detail line.
struct PosterShelf: View {
    let tiles: [ShelfTile]
    let posters: [String: UIImage]
    let theme: WidgetTheme

    private let posterHeight: CGFloat = 66

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(0..<WidgetLayout.shelfTiles, id: \.self) { index in
                if index < tiles.count {
                    let tile = tiles[index]
                    Link(destination: WidgetShared.appURL(path: tile.path)) {
                        VStack(alignment: .leading, spacing: 2) {
                            PosterImage(
                                image: posters[tile.id],
                                width: posterHeight * 2 / 3,
                                height: posterHeight,
                                theme: theme
                            )
                            .padding(.bottom, 2)
                            Text(tile.title)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(theme.text)
                                .lineLimit(1)
                            Text(tile.detail)
                                .font(.caption2)
                                .foregroundStyle(tile.highlighted ? theme.accent : theme.muted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    Color.clear.frame(maxWidth: .infinity)
                }
            }
        }
    }
}

/// Large widgets: a poster beside one or two lines of text.
struct PosterRow: View {
    let image: UIImage?
    let line1: String?
    let line2: String
    var trailing: String? = nil
    var detail: String? = nil
    var detailHighlighted = false
    let theme: WidgetTheme

    var body: some View {
        HStack(spacing: 10) {
            PosterImage(image: image, width: 30, height: 45, theme: theme)
            VStack(alignment: .leading, spacing: 2) {
                if let line1 {
                    Text(line1)
                        .font(.caption2)
                        .foregroundStyle(theme.muted)
                        .lineLimit(1)
                }
                Text(line2)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
                if let detail {
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(detailHighlighted ? theme.accent : theme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            if let trailing {
                Text(trailing)
                    .font(.caption2)
                    .foregroundStyle(theme.muted)
            }
        }
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
