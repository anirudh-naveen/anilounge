package net.anilounge.app.widget;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Both widgets' data, from GET /api/widget/feed (backend: services/widgetService.js). */
public final class WidgetFeed {

    public final boolean signedIn;
    public final List<Activity> activity;
    /** "watchlist" (the viewer's titles) or "trending". */
    public final String releasesSource;
    public final List<Release> releases;

    private WidgetFeed(boolean signedIn, List<Activity> activity, String releasesSource, List<Release> releases) {
        this.signedIn = signedIn;
        this.activity = activity;
        this.releasesSource = releasesSource;
        this.releases = releases;
    }

    public static final class Activity {
        public final String id;
        /** "You" or a friend's username. */
        public final String who;
        /** e.g. "watched episode 5 of". */
        public final String did;
        public final String title;
        public final Date at;
        public final String path;
        /** Small poster URL, or null. */
        public final String poster;

        Activity(String id, String who, String did, String title, Date at, String path, String poster) {
            this.id = id;
            this.who = who;
            this.did = did;
            this.title = title;
            this.at = at;
            this.path = path;
            this.poster = poster;
        }
    }

    public static final class Release {
        public final String id;
        public final String title;
        /** "episode" or "premiere". */
        public final String kind;
        /** Episode number, or null. */
        public final Integer episode;
        /** When it airs or aired; null for a weekly slot or an undated premiere. */
        public final Date at;
        public final String path;
        public final String poster;

        Release(String id, String title, String kind, Integer episode, Date at, String path, String poster) {
            this.id = id;
            this.title = title;
            this.kind = kind;
            this.episode = episode;
            this.at = at;
            this.path = path;
            this.poster = poster;
        }

        public boolean isEpisode() {
            return "episode".equals(kind);
        }
    }

    /**
     * Parse the feed object (the response's {@code data}).
     * @throws JSONException when it isn't a feed.
     */
    public static WidgetFeed parse(JSONObject data) throws JSONException {
        List<Activity> activity = new ArrayList<>();
        JSONArray rows = data.getJSONArray("activity");
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            Date at = date(row.optString("at", null));
            if (at == null) continue;
            activity.add(
                new Activity(
                    row.getString("id"),
                    row.getString("who"),
                    row.getString("did"),
                    row.getString("title"),
                    at,
                    row.optString("path", "/"),
                    string(row, "poster")
                )
            );
        }
        JSONObject releasesObject = data.getJSONObject("releases");
        List<Release> releases = new ArrayList<>();
        JSONArray items = releasesObject.getJSONArray("items");
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            releases.add(
                new Release(
                    item.getString("id"),
                    item.getString("title"),
                    item.getString("kind"),
                    item.isNull("episode") || !item.has("episode") ? null : item.getInt("episode"),
                    date(string(item, "at")),
                    item.optString("path", "/"),
                    string(item, "poster")
                )
            );
        }
        return new WidgetFeed(data.getBoolean("signedIn"), activity, releasesObject.optString("source", "watchlist"), releases);
    }

    private static String string(JSONObject object, String key) {
        return object.has(key) && !object.isNull(key) ? object.optString(key, null) : null;
    }

    /** ISO 8601, with or without fractional seconds (e.g. Date#toISOString). */
    static Date date(String text) {
        if (text == null) return null;
        for (String pattern : new String[] { "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX" }) {
            SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            try {
                return format.parse(text);
            } catch (ParseException ignored) {
                // Try the next pattern.
            }
        }
        return null;
    }
}
