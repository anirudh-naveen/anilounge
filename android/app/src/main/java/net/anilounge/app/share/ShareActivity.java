package net.anilounge.app.share;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import net.anilounge.app.R;
import net.anilounge.app.widget.FeedClient;
import net.anilounge.app.widget.WidgetStore;
import net.anilounge.app.widget.WidgetUpdater;
import org.json.JSONObject;

/**
 * "Add to AniLounge" in other apps' share sheets: shows the title behind a shared AniList,
 * MyAnimeList, TMDB, or AniLounge link and adds it to the watchlist (the Android side of
 * ios/App/AniLoungeShare/ShareViewController.swift; backend: services/shareService.js).
 * Signs in with the widget token the app stores (WidgetStore).
 */
public class ShareActivity extends Activity {

    private static final String USER_AGENT = "AniLoungeShare/1.0 (Android)";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private View loading;
    private View titleBlock;
    private TextView kind;
    private TextView title;
    private View add;
    private View addLabel;
    private View addProgress;
    private View result;
    private ImageView resultIcon;
    private TextView resultText;
    private TextView close;

    /** The title found for the shared link. */
    private static final class Title {
        final String id;
        final String name;
        final String contentType;
        final String status;

        Title(JSONObject json) {
            id = json.optString("id");
            name = json.optString("title");
            contentType = json.optString("contentType");
            status = json.isNull("status") ? null : json.optString("status", null);
        }

        String kindLabel() {
            return switch (contentType) {
                case "movie" -> "Movie";
                case "special" -> "Special";
                case "season" -> "Season";
                default -> "Series";
            };
        }
    }

    private static final class ApiException extends Exception {
        ApiException(String message) {
            super(message);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_share);
        loading = findViewById(R.id.share_loading);
        titleBlock = findViewById(R.id.share_title_block);
        kind = findViewById(R.id.share_kind);
        title = findViewById(R.id.share_title);
        add = findViewById(R.id.share_add);
        addLabel = findViewById(R.id.share_add_label);
        addProgress = findViewById(R.id.share_add_progress);
        result = findViewById(R.id.share_result);
        resultIcon = findViewById(R.id.share_result_icon);
        resultText = findViewById(R.id.share_result_text);
        close = findViewById(R.id.share_close);
        close.setOnClickListener((view) -> finish());
        start(sharedText(getIntent()));
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    /** The shared link (or text containing one). */
    private static String sharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text != null && text.length() > 0) return text.toString();
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        return subject != null && !subject.isEmpty() ? subject : null;
    }

    private void start(String shared) {
        if (shared == null) {
            showFailure("Nothing to add. Share a link to a title instead.");
            return;
        }
        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("url", shared);
                Title found = new Title(post("widget/share/lookup", body).getJSONObject("data"));
                runOnUiThread(() -> {
                    if (found.status == null) showFound(found);
                    else showAdded(found, true);
                });
            } catch (Exception error) {
                runOnUiThread(() -> showFailure(message(error)));
            }
        });
    }

    private void addTitle(Title found) {
        add.setEnabled(false);
        addLabel.setVisibility(View.INVISIBLE);
        addProgress.setVisibility(View.VISIBLE);
        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("contentId", found.id);
                boolean added = post("widget/share/add", body).getJSONObject("data").optBoolean("added", true);
                // The Watchlist widget shows the new title next time; refresh it now.
                WidgetUpdater.refreshAsync(getApplicationContext());
                runOnUiThread(() -> showAdded(found, !added));
            } catch (Exception error) {
                runOnUiThread(() -> showFailure(message(error)));
            }
        });
    }

    private void showTitle(Title found) {
        loading.setVisibility(View.GONE);
        titleBlock.setVisibility(View.VISIBLE);
        kind.setText(found.kindLabel());
        title.setText(found.name);
    }

    private void showFound(Title found) {
        showTitle(found);
        add.setVisibility(View.VISIBLE);
        add.setEnabled(true);
        add.setOnClickListener((view) -> addTitle(found));
    }

    private void showAdded(Title found, boolean alreadyThere) {
        showTitle(found);
        add.setVisibility(View.GONE);
        result.setVisibility(View.VISIBLE);
        resultIcon.setImageResource(R.drawable.ic_share_done);
        resultIcon.setColorFilter(getColor(R.color.accent));
        resultText.setText(alreadyThere ? "Already on your watchlist." : "Added to Plan to Watch.");
        resultText.setTextColor(getColor(R.color.accent));
        resultText.setTypeface(resultText.getTypeface(), android.graphics.Typeface.BOLD);
        close.setText("Done");
    }

    private void showFailure(String text) {
        loading.setVisibility(View.GONE);
        add.setVisibility(View.GONE);
        result.setVisibility(View.VISIBLE);
        resultIcon.setImageResource(R.drawable.ic_share_warning);
        resultIcon.setColorFilter(0xFFAAB3C5);
        resultText.setText(text);
        resultText.setTextColor(0xFFAAB3C5);
    }

    private static String message(Exception error) {
        return error instanceof ApiException ? error.getMessage() : "Couldn't reach AniLounge. Try again.";
    }

    private JSONObject post(String path, JSONObject body) throws Exception {
        String token = WidgetStore.token(this);
        if (token == null) throw new ApiException("Open AniLounge and sign in first.");
        HttpURLConnection connection = (HttpURLConnection) new URL(WidgetStore.api(this, path)).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Authorization", "Widget " + token);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            JSONObject envelope = null;
            if (stream != null) {
                try (InputStream in = stream) {
                    envelope = new JSONObject(new String(FeedClient.read(in), StandardCharsets.UTF_8));
                } catch (Exception ignored) {
                    envelope = null;
                }
            }
            if (status != 200 || envelope == null || envelope.isNull("data")) {
                String message = envelope == null ? null : envelope.optString("message", null);
                throw new ApiException(message != null && !message.isEmpty() ? message : "Couldn't reach AniLounge. Try again.");
            }
            return envelope;
        } finally {
            connection.disconnect();
        }
    }
}
