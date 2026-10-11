import Foundation
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
    }
}

struct FeedEntry: TimelineEntry {
    let date: Date
    /// Latest feed, or the last one that loaded when offline.
    let feed: WidgetFeed?
    /// True when nothing could be loaded at all.
    let unavailable: Bool
}

enum FeedClient {
    private static let cacheKey = "widgetFeedCache"

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

    /// Fetch the feed (signed in when the app left a widget token). An expired token is
    /// dropped and the signed-out feed is used; offline, the last good feed is reused.
    static func load(now: Date = Date()) async -> FeedEntry {
        let defaults = WidgetShared.defaults
        var token = defaults?.string(forKey: WidgetShared.tokenKey)
        for _ in 0..<2 {
            switch await fetch(token: token) {
            case .loaded(let data, let feed):
                defaults?.set(data, forKey: cacheKey)
                return FeedEntry(date: now, feed: feed, unavailable: false)
            case .expired:
                defaults?.removeObject(forKey: WidgetShared.tokenKey)
                token = nil
            case .failed:
                let cached = defaults?.data(forKey: cacheKey)
                    .flatMap { try? decoder.decode(WidgetFeed.self, from: $0) }
                return FeedEntry(date: now, feed: cached, unavailable: cached == nil)
            }
        }
        return FeedEntry(date: now, feed: nil, unavailable: true)
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
    /// Widgets refresh about this often (WidgetKit may stretch it); the app also asks
    /// for a refresh when the watchlist changes.
    private let refreshInterval: TimeInterval = 30 * 60

    func placeholder(in context: Context) -> FeedEntry { .preview }

    func getSnapshot(in context: Context, completion: @escaping (FeedEntry) -> Void) {
        if context.isPreview {
            completion(.preview)
            return
        }
        Task { completion(await FeedClient.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FeedEntry>) -> Void) {
        Task {
            let entry = await FeedClient.load()
            completion(Timeline(entries: [entry], policy: .after(entry.date.addingTimeInterval(refreshInterval))))
        }
    }
}

extension FeedEntry {
    /// Sample data for the widget gallery.
    static var preview: FeedEntry {
        let now = Date()
        return FeedEntry(
            date: now,
            feed: WidgetFeed(
                signedIn: true,
                activity: [
                    .init(id: "1", who: "You", isSelf: true, did: "watched episode 12 of",
                          title: "Frieren: Beyond Journey's End", at: now.addingTimeInterval(-1_800), path: "/"),
                    .init(id: "2", who: "mika", isSelf: false, did: "completed",
                          title: "Look Back", at: now.addingTimeInterval(-7_200), path: "/"),
                    .init(id: "3", who: "sora", isSelf: false, did: "started watching",
                          title: "Dandadan", at: now.addingTimeInterval(-20_000), path: "/"),
                ],
                releases: .init(source: "watchlist", items: [
                    .init(id: "a", title: "Frieren: Beyond Journey's End", kind: "episode", episode: 13,
                          at: now.addingTimeInterval(-3_600), path: "/"),
                    .init(id: "b", title: "Dandadan", kind: "episode", episode: 5,
                          at: now.addingTimeInterval(86_400), path: "/"),
                    .init(id: "c", title: "Chainsaw Man – The Movie", kind: "premiere", episode: nil,
                          at: now.addingTimeInterval(5 * 86_400), path: "/"),
                ])
            ),
            unavailable: false
        )
    }
}
