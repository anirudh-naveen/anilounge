import Foundation
import ImageIO
import UIKit
import WidgetKit

/// Both widgets' data, from GET /api/widget/feed (services/widgetService.js).
struct WidgetFeed: Codable {
    let signedIn: Bool
    let activity: [Activity]
    let releases: Releases

    struct Activity: Codable, Identifiable {
        let id: String
        /// "You" or a friend's username.
        let who: String
        let isSelf: Bool
        /// e.g. "watched episode 5 of".
        let did: String
        let title: String
        let at: Date
        let path: String
        /// Small poster URL (absent from older servers).
        let poster: String?
    }

    struct Releases: Codable {
        /// "watchlist" (the viewer's titles) or "trending".
        let source: String
        let items: [Release]
    }

    struct Release: Codable, Identifiable {
        let id: String
        let title: String
        /// "episode" or "premiere".
        let kind: String
        let episode: Int?
        /// When it airs or aired; nil for a weekly slot or an undated premiere.
        let at: Date?
        let path: String
        let poster: String?
    }
}

/// Which widget a timeline is for: each downloads only the posters it shows.
enum WidgetKind {
    case watchlist
    case releases
}

struct FeedEntry: TimelineEntry {
    let date: Date
    /// Latest feed, or the last one that loaded when offline.
    let feed: WidgetFeed?
    /// True when nothing could be loaded at all.
    let unavailable: Bool
    /// The site theme picked in the app (WidgetTheme.swift).
    let theme: WidgetTheme
    /// Downloaded posters, by item id.
    var posters: [String: UIImage] = [:]
}

enum FeedClient {
    private static let cacheKey = "widgetFeedCache"
    /// The featured small poster is ~170pt tall; 3× that is sharp and keeps memory low.
    private static let posterPixels = 520

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let precise = ISO8601DateFormatter()
        precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = precise.date(from: text) ?? plain.date(from: text) { return date }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Bad date \(text)"))
        }
        return decoder
    }()

    private struct Envelope: Decodable { let data: WidgetFeed }

    /// Fetch the feed (signed in when the app left a widget token) and the posters this
    /// widget shows. An expired token is dropped and the signed-out feed is used;
    /// offline, the last good feed is reused (without posters).
    static func load(kind: WidgetKind, family: WidgetFamily, now: Date = Date()) async -> FeedEntry {
        let defaults = WidgetShared.defaults
        let theme = WidgetTheme.current
        var token = defaults?.string(forKey: WidgetShared.tokenKey)
        for _ in 0..<2 {
            switch await fetch(token: token) {
            case .loaded(let data, let feed):
                defaults?.set(data, forKey: cacheKey)
                var entry = FeedEntry(date: now, feed: feed, unavailable: false, theme: theme)
                entry.posters = await posters(for: feed, kind: kind, family: family)
                return entry
            case .expired:
                defaults?.removeObject(forKey: WidgetShared.tokenKey)
                token = nil
            case .failed:
                let cached = defaults?.data(forKey: cacheKey)
                    .flatMap { try? decoder.decode(WidgetFeed.self, from: $0) }
                return FeedEntry(date: now, feed: cached, unavailable: cached == nil, theme: theme)
            }
        }
        return FeedEntry(date: now, feed: nil, unavailable: true, theme: theme)
    }

    /// Poster URLs the widget will show at this size (see WidgetLayout.posterCount).
    private static func posterURLs(for feed: WidgetFeed, kind: WidgetKind, family: WidgetFamily) -> [(String, URL)] {
        let count = WidgetLayout.posterCount(kind: kind, family: family)
        guard count > 0 else { return [] }
        let items: [(String, String?)] = switch kind {
        case .watchlist: feed.activity.prefix(count).map { ($0.id, $0.poster) }
        case .releases: feed.releases.items.prefix(count).map { ($0.id, $0.poster) }
        }
        // The small Recent releases widget fills itself with one poster: ask TMDB for a
        // bigger size than the thumbnail the feed lists.
        let featured = kind == .releases && family == .systemSmall
        return items.compactMap { id, poster in
            guard let poster else { return nil }
            let address = featured ? poster.replacingOccurrences(of: "/t/p/w154/", with: "/t/p/w342/") : poster
            guard let url = URL(string: address) else { return nil }
            return (id, url)
        }
    }

    private static func posters(for feed: WidgetFeed, kind: WidgetKind, family: WidgetFamily) async -> [String: UIImage] {
        await withTaskGroup(of: (String, UIImage?).self) { group in
            for (id, url) in posterURLs(for: feed, kind: kind, family: family) {
                group.addTask { (id, await thumbnail(url)) }
            }
            var images: [String: UIImage] = [:]
            for await (id, image) in group {
                if let image { images[id] = image }
            }
            return images
        }
    }

    /// A downsampled poster; nil when it can't be fetched (the row shows a placeholder).
    private static func thumbnail(_ url: URL) async -> UIImage? {
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.setValue("AniLoungeWidgets/1.0 (iOS)", forHTTPHeaderField: "User-Agent")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: posterPixels,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: image)
    }

    private enum Result {
        case loaded(Data, WidgetFeed)
        case expired
        case failed
    }

    private static func fetch(token: String?) async -> Result {
        var request = URLRequest(url: WidgetShared.feedURL, timeoutInterval: 15)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("AniLoungeWidgets/1.0 (iOS)", forHTTPHeaderField: "User-Agent")
        if let token { request.setValue("Widget \(token)", forHTTPHeaderField: "Authorization") }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, token != nil { return .expired }
            guard status == 200 else { return .failed }
            let feed = try decoder.decode(Envelope.self, from: data).data
            // Cache just the feed so the offline copy decodes the same way.
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            return .loaded((try? encoder.encode(feed)) ?? data, feed)
        } catch {
            return .failed
        }
    }
}

struct FeedProvider: TimelineProvider {
    let kind: WidgetKind

    /// Widgets refresh about this often (WidgetKit may stretch it); the app also asks
    /// for a refresh when the watchlist or theme changes.
    private let refreshInterval: TimeInterval = 30 * 60

    func placeholder(in context: Context) -> FeedEntry { .preview }

    func getSnapshot(in context: Context, completion: @escaping (FeedEntry) -> Void) {
        if context.isPreview {
            completion(.preview)
            return
        }
        Task { completion(await FeedClient.load(kind: kind, family: context.family)) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FeedEntry>) -> Void) {
        Task {
            let entry = await FeedClient.load(kind: kind, family: context.family)
            completion(Timeline(entries: [entry], policy: .after(entry.date.addingTimeInterval(refreshInterval))))
        }
    }
}

extension FeedEntry {
    /// Sample data for the widget gallery (no posters: they'd need a download).
    static var preview: FeedEntry {
        let now = Date()
        return FeedEntry(
            date: now,
            feed: WidgetFeed(
                signedIn: true,
                activity: [
                    .init(id: "1", who: "You", isSelf: true, did: "watched episode 12 of",
                          title: "Frieren: Beyond Journey's End", at: now.addingTimeInterval(-1_800), path: "/", poster: nil),
                    .init(id: "2", who: "mika", isSelf: false, did: "completed",
                          title: "Look Back", at: now.addingTimeInterval(-7_200), path: "/", poster: nil),
                    .init(id: "3", who: "sora", isSelf: false, did: "started watching",
                          title: "Dandadan", at: now.addingTimeInterval(-20_000), path: "/", poster: nil),
                    .init(id: "4", who: "You", isSelf: true, did: "planned to watch",
                          title: "The Apothecary Diaries", at: now.addingTimeInterval(-90_000), path: "/", poster: nil),
                ],
                releases: .init(source: "watchlist", items: [
                    .init(id: "a", title: "Frieren: Beyond Journey's End", kind: "episode", episode: 13,
                          at: now.addingTimeInterval(-3_600), path: "/", poster: nil),
                    .init(id: "b", title: "Dandadan", kind: "episode", episode: 5,
                          at: now.addingTimeInterval(86_400), path: "/", poster: nil),
                    .init(id: "c", title: "Chainsaw Man – The Movie", kind: "premiere", episode: nil,
                          at: now.addingTimeInterval(5 * 86_400), path: "/", poster: nil),
                    .init(id: "d", title: "One Piece", kind: "episode", episode: 1120,
                          at: nil, path: "/", poster: nil),
                ])
            ),
            unavailable: false,
            theme: .current
        )
    }
}
