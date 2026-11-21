package net.anilounge.app.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Loads the widget feed and its posters (the Android side of
 * ios/App/AniLoungeWidgets/Feed.swift). Blocking: call it off the main thread.
 */
public final class FeedClient {

    private static final String USER_AGENT = "AniLoungeWidgets/1.0 (Android)";
    /** Posters in list rows and shelves are at most ~66dp tall; this is sharp at 3x. */
    private static final int THUMB_PIXELS = 240;
    /** The featured small poster fills the widget. */
    private static final int FEATURED_PIXELS = 520;

    private FeedClient() {}

    /** One load of the feed, for every widget. */
    public static final class Entry {
        public final long now;
        /** Latest feed, or the last one that loaded when offline. */
        public final WidgetFeed feed;
        /** True when nothing could be loaded at all. */
        public final boolean unavailable;
        public final WidgetTheme theme;
        /** Downloaded posters, by item id. */
        public final Map<String, Bitmap> activityPosters = new HashMap<>();
        public final Map<String, Bitmap> releasePosters = new HashMap<>();
        /** The first release's larger poster (small Recent releases widget). */
        public Bitmap featuredPoster;

        Entry(long now, WidgetFeed feed, boolean unavailable, WidgetTheme theme) {
            this.now = now;
            this.feed = feed;
            this.unavailable = unavailable;
            this.theme = theme;
        }
    }

    private enum Status {
        LOADED,
        EXPIRED,
        FAILED
    }

    private static final class Result {
        final Status status;
        final String json;
        final WidgetFeed feed;

        Result(Status status, String json, WidgetFeed feed) {
            this.status = status;
            this.json = json;
            this.feed = feed;
        }
    }

    /**
     * Fetch the feed (signed in when the app left a widget token) and the posters the
     * placed widgets show. An expired token is dropped and the signed-out feed is used;
     * offline, the last good feed is reused (without posters).
     * @param withActivityPosters Whether a Watchlist updates widget is placed.
     * @param withReleasePosters Whether a Recent releases widget is placed.
     */
    public static Entry load(Context context, boolean withActivityPosters, boolean withReleasePosters) {
        long now = System.currentTimeMillis();
        WidgetTheme theme = WidgetTheme.current(context);
        String token = WidgetStore.token(context);
        for (int attempt = 0; attempt < 2; attempt++) {
            Result result = fetch(context, token);
            if (result.status == Status.LOADED) {
                WidgetStore.setCachedFeed(context, result.json);
                Entry entry = new Entry(now, result.feed, false, theme);
                loadPosters(entry, withActivityPosters, withReleasePosters);
                return entry;
            }
            if (result.status == Status.EXPIRED) {
                WidgetStore.clearToken(context);
                token = null;
                continue;
            }
            WidgetFeed cached = null;
            String json = WidgetStore.cachedFeed(context);
            if (json != null) {
                try {
                    cached = WidgetFeed.parse(new JSONObject(json));
                } catch (Exception ignored) {
                    cached = null;
                }
            }
            return new Entry(now, cached, cached == null, theme);
        }
        return new Entry(now, null, true, theme);
    }

    private static Result fetch(Context context, String token) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(WidgetStore.api(context, "widget/feed")).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", USER_AGENT);
            if (token != null) connection.setRequestProperty("Authorization", "Widget " + token);
            int status = connection.getResponseCode();
            if (status == 401 && token != null) return new Result(Status.EXPIRED, null, null);
            if (status != 200) return new Result(Status.FAILED, null, null);
            String body = new String(read(connection.getInputStream()), StandardCharsets.UTF_8);
            JSONObject data = new JSONObject(body).getJSONObject("data");
            return new Result(Status.LOADED, data.toString(), WidgetFeed.parse(data));
        } catch (Exception error) {
            return new Result(Status.FAILED, null, null);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static void loadPosters(Entry entry, boolean withActivity, boolean withReleases) {
        List<String[]> jobs = new ArrayList<>(); // [group, id, url, maxPixels]
        if (withActivity) {
            for (WidgetFeed.Activity item : first(entry.feed.activity, WidgetRenderer.LARGE_ROWS)) {
                if (item.poster != null) jobs.add(new String[] { "activity", item.id, item.poster, "" + THUMB_PIXELS });
            }
        }
        if (withReleases) {
            List<WidgetFeed.Release> releases = first(entry.feed.releases, WidgetRenderer.LARGE_ROWS);
            for (WidgetFeed.Release item : releases) {
                if (item.poster != null) jobs.add(new String[] { "release", item.id, item.poster, "" + THUMB_PIXELS });
            }
            if (!releases.isEmpty() && releases.get(0).poster != null) {
                // Ask TMDB for a bigger size than the thumbnail the feed lists.
                String big = releases.get(0).poster.replace("/t/p/w154/", "/t/p/w342/");
                jobs.add(new String[] { "featured", releases.get(0).id, big, "" + FEATURED_PIXELS });
            }
        }
        if (jobs.isEmpty()) return;
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(4, jobs.size()));
        try {
            List<Future<Bitmap>> futures = new ArrayList<>();
            for (String[] job : jobs) {
                futures.add(pool.submit(() -> thumbnail(job[2], Integer.parseInt(job[3]))));
            }
            for (int i = 0; i < jobs.size(); i++) {
                Bitmap image;
                try {
                    image = futures.get(i).get(10, TimeUnit.SECONDS);
                } catch (Exception error) {
                    image = null;
                }
                if (image == null) continue;
                String[] job = jobs.get(i);
                switch (job[0]) {
                    case "activity" -> entry.activityPosters.put(job[1], image);
                    case "release" -> entry.releasePosters.put(job[1], image);
                    default -> entry.featuredPoster = image;
                }
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private static <T> List<T> first(List<T> list, int count) {
        return list.subList(0, Math.min(count, list.size()));
    }

    /** A downsampled poster; null when it can't be fetched (the row shows a placeholder). */
    private static Bitmap thumbnail(String address, int maxPixels) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            if (connection.getResponseCode() != 200) return null;
            byte[] bytes = read(connection.getInputStream());
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            if (longest <= 0) return null;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            while (longest / (options.inSampleSize * 2) >= maxPixels) options.inSampleSize *= 2;
            Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (decoded == null) return null;
            int big = Math.max(decoded.getWidth(), decoded.getHeight());
            if (big <= maxPixels) return decoded;
            float scale = (float) maxPixels / big;
            Bitmap scaled = Bitmap.createScaledBitmap(
                decoded,
                Math.max(1, Math.round(decoded.getWidth() * scale)),
                Math.max(1, Math.round(decoded.getHeight() * scale)),
                true
            );
            if (scaled != decoded) decoded.recycle();
            return scaled;
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    public static byte[] read(InputStream input) throws IOException {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            return out.toByteArray();
        }
    }
}
