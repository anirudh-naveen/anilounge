import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Share to AniLounge": shows the title behind a shared AniList, MyAnimeList, TMDB, or
/// AniLounge link and adds it to the watchlist (backend: services/shareService.js).
class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let model = ShareModel(close: { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        })
        let host = UIHostingController(rootView: ShareView(model: model))
        // The sheet always uses AniLounge's dark look, whatever the system setting.
        overrideUserInterfaceStyle = .dark
        host.overrideUserInterfaceStyle = .dark
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)

        Task { model.start(with: await sharedText()) }
    }

    /// The shared link (or text containing one).
    private func sharedText() async -> String? {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] } ?? []
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                return url.absoluteString
            }
        }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                return text
            }
        }
        return nil
    }
}

/// What the share sheet shows, and the two API calls behind it.
@MainActor
final class ShareModel: ObservableObject {
    struct Title: Decodable {
        let id: String
        let title: String
        let contentType: String
        let path: String
        let status: String?
    }

    enum Phase {
        case loading
        case found(Title)
        case adding(Title)
        case added(Title, alreadyThere: Bool)
        case failed(String)
    }

    @Published var phase: Phase = .loading
    let close: () -> Void

    init(close: @escaping () -> Void) {
        self.close = close
    }

    func start(with shared: String?) {
        guard let shared, !shared.isEmpty else {
            phase = .failed("Nothing to add. Share a link to a title instead.")
            return
        }
        Task {
            do {
                let title: Title = try await post("widget/share/lookup", body: ["url": shared])
                phase = title.status == nil ? .found(title) : .added(title, alreadyThere: true)
            } catch {
                phase = .failed(error.localizedDescription)
            }
        }
    }

    func add(_ title: Title) {
        phase = .adding(title)
        Task {
            struct Added: Decodable { let added: Bool }
            do {
                let result: Added = try await post("widget/share/add", body: ["contentId": title.id])
                phase = .added(title, alreadyThere: !result.added)
            } catch {
                phase = .failed(error.localizedDescription)
            }
        }
    }

    private struct APIError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private struct Envelope<T: Decodable>: Decodable {
        let data: T?
        let message: String?
    }

    private func post<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
        guard let token = WidgetShared.defaults?.string(forKey: WidgetShared.tokenKey) else {
            throw APIError(message: "Open AniLounge and sign in first.")
        }
        var request = URLRequest(url: WidgetShared.api(path: path), timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("AniLoungeShare/1.0 (iOS)", forHTTPHeaderField: "User-Agent")
        request.setValue("Widget \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        let envelope = try? JSONDecoder().decode(Envelope<T>.self, from: data)
        guard (response as? HTTPURLResponse)?.statusCode == 200, let value = envelope?.data else {
            throw APIError(message: envelope?.message ?? "Couldn't reach AniLounge. Try again.")
        }
        return value
    }
}

struct ShareView: View {
    @ObservedObject var model: ShareModel

    private let background = Color(red: 15 / 255, green: 23 / 255, blue: 38 / 255)
    private let accent = Color(red: 224 / 255, green: 122 / 255, blue: 95 / 255)

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                content
                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background.ignoresSafeArea())
            .navigationTitle("Add to AniLounge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(isFinished ? "Done" : "Cancel", action: model.close)
                        .foregroundStyle(accent)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var isFinished: Bool {
        if case .added = model.phase { return true }
        return false
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            HStack(spacing: 10) {
                ProgressView()
                Text("Finding this title…").foregroundStyle(.secondary)
            }
        case .found(let title), .adding(let title):
            titleHeader(title)
            Button {
                model.add(title)
            } label: {
                Group {
                    if case .adding = model.phase {
                        ProgressView().tint(.white)
                    } else {
                        Text("Add to Plan to Watch").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .background(accent, in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
            .disabled({ if case .adding = model.phase { return true } else { return false } }())
        case .added(let title, let alreadyThere):
            titleHeader(title)
            Label(
                alreadyThere ? "Already on your watchlist." : "Added to Plan to Watch.",
                systemImage: "checkmark.circle.fill"
            )
            .foregroundStyle(accent)
            .font(.body.weight(.semibold))
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.secondary)
        }
    }

    private func titleHeader(_ title: ShareModel.Title) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.contentType == "movie" ? "Movie" : title.contentType == "special" ? "Special" : title.contentType == "season" ? "Season" : "Series")
                .font(.caption.weight(.semibold))
                .foregroundStyle(accent)
            Text(title.title)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
        }
    }
}
