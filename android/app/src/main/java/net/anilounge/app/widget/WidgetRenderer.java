package net.anilounge.app.widget;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.anilounge.app.MainActivity;
import net.anilounge.app.R;

/**
 * Draws the two widgets at each size (the Android side of
 * ios/App/AniLoungeWidgets/AniLoungeWidgets.swift): small, medium (a shelf of posters),
 * and large (rows of posters), plus the small Recent releases widget's full-bleed poster.
 */
public final class WidgetRenderer {

    public enum Size {
        SMALL,
        MEDIUM,
        LARGE
    }

    public enum Kind {
        WATCHLIST,
        RELEASES
    }

    /** Text rows in the small Watchlist widget. */
    static final int SMALL_ROWS = 2;
    /** Poster tiles across a medium widget. */
    static final int SHELF_TILES = 4;
    /** Poster rows in a large widget. */
    static final int LARGE_ROWS = 6;

    private static final int[] SMALL_IDS = { R.id.small0, R.id.small1 };
    private static final int[] SMALL_LINE1 = { R.id.small0_line1, R.id.small1_line1 };
    private static final int[] SMALL_LINE2 = { R.id.small0_line2, R.id.small1_line2 };

    private static final int[] TILES = { R.id.tile0, R.id.tile1, R.id.tile2, R.id.tile3 };
    private static final int[] TILE_FILL = { R.id.tile0_fill, R.id.tile1_fill, R.id.tile2_fill, R.id.tile3_fill };
    private static final int[] TILE_FILM = { R.id.tile0_film, R.id.tile1_film, R.id.tile2_film, R.id.tile3_film };
    private static final int[] TILE_POSTER = { R.id.tile0_poster, R.id.tile1_poster, R.id.tile2_poster, R.id.tile3_poster };
    private static final int[] TILE_TITLE = { R.id.tile0_title, R.id.tile1_title, R.id.tile2_title, R.id.tile3_title };
    private static final int[] TILE_DETAIL = { R.id.tile0_detail, R.id.tile1_detail, R.id.tile2_detail, R.id.tile3_detail };

    private static final int[] ROWS = { R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5 };
    private static final int[] ROW_FILL = { R.id.row0_fill, R.id.row1_fill, R.id.row2_fill, R.id.row3_fill, R.id.row4_fill, R.id.row5_fill };
    private static final int[] ROW_FILM = { R.id.row0_film, R.id.row1_film, R.id.row2_film, R.id.row3_film, R.id.row4_film, R.id.row5_film };
    private static final int[] ROW_POSTER = {
        R.id.row0_poster,
        R.id.row1_poster,
        R.id.row2_poster,
        R.id.row3_poster,
        R.id.row4_poster,
        R.id.row5_poster
    };
    private static final int[] ROW_LINE1 = { R.id.row0_line1, R.id.row1_line1, R.id.row2_line1, R.id.row3_line1, R.id.row4_line1, R.id.row5_line1 };
    private static final int[] ROW_LINE2 = { R.id.row0_line2, R.id.row1_line2, R.id.row2_line2, R.id.row3_line2, R.id.row4_line2, R.id.row5_line2 };
    private static final int[] ROW_DETAIL = {
        R.id.row0_detail,
        R.id.row1_detail,
        R.id.row2_detail,
        R.id.row3_detail,
        R.id.row4_detail,
        R.id.row5_detail
    };
    private static final int[] ROW_TRAILING = {
        R.id.row0_trailing,
        R.id.row1_trailing,
        R.id.row2_trailing,
        R.id.row3_trailing,
        R.id.row4_trailing,
        R.id.row5_trailing
    };

    private WidgetRenderer() {}

    /** One tile or row: what it says and where it goes. */
    private static final class Item {
        final String id;
        final String path;
        final String line1;
        final String title;
        final String detail;
        final boolean highlighted;
        final String trailing;

        Item(String id, String path, String line1, String title, String detail, boolean highlighted, String trailing) {
            this.id = id;
            this.path = path;
            this.line1 = line1;
            this.title = title;
            this.detail = detail;
            this.highlighted = highlighted;
            this.trailing = trailing;
        }
    }

    public static RemoteViews render(Context context, Kind kind, Size size, FeedClient.Entry entry, int widgetId) {
        return kind == Kind.WATCHLIST ? watchlist(context, size, entry, widgetId) : releases(context, size, entry, widgetId);
    }

    // ---------------------------------------------------------------------------------
    // Watchlist updates: your and your friends' latest watchlist changes.
    // ---------------------------------------------------------------------------------

    private static RemoteViews watchlist(Context context, Size size, FeedClient.Entry entry, int widgetId) {
        WidgetTheme theme = entry.theme;
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutFor(size));
        background(views, theme);
        header(views, size == Size.SMALL ? "Watchlist" : "Watchlist updates", R.drawable.ic_widget_people);
        click(context, views, R.id.content, "/", widgetId, 0);

        WidgetFeed feed = entry.feed;
        String note = null;
        if (feed != null && feed.signedIn) {
            if (feed.activity.isEmpty()) note = "Nothing yet. Update your watchlist or add friends to see activity here.";
        } else if (entry.unavailable) {
            note = "Couldn't load updates. Check your connection.";
        } else {
            note = "Open AniLounge and sign in to see your watchlist updates.";
        }
        List<WidgetFeed.Activity> activity = note == null ? feed.activity : Collections.emptyList();
        showNote(views, note, theme);

        Item[] items = new Item[activity.size()];
        for (int i = 0; i < items.length; i++) {
            WidgetFeed.Activity row = activity.get(i);
            String ago = ago(row.at.getTime(), entry.now);
            items[i] = switch (size) {
                case SMALL -> new Item(row.id, row.path, row.who + " " + row.did, row.title, null, false, null);
                case MEDIUM -> new Item(row.id, row.path, null, row.title, row.who + " · " + ago, false, null);
                case LARGE -> new Item(row.id, row.path, row.who + " " + row.did, row.title, null, false, ago);
            };
        }
        fill(context, views, size, items, entry.activityPosters, theme, widgetId);
        return views;
    }

    // ---------------------------------------------------------------------------------
    // Recent releases: new episodes and premieres for your watchlist (trending signed out).
    // ---------------------------------------------------------------------------------

    private static RemoteViews releases(Context context, Size size, FeedClient.Entry entry, int widgetId) {
        WidgetTheme theme = entry.theme;
        List<WidgetFeed.Release> items = entry.feed == null ? Collections.emptyList() : entry.feed.releases;
        if (size == Size.SMALL && !items.isEmpty()) return featured(context, items.get(0), entry, widgetId);

        RemoteViews views = new RemoteViews(context.getPackageName(), size == Size.SMALL ? R.layout.widget_shelf : layoutFor(size));
        background(views, theme);
        String source = entry.feed == null ? null : entry.feed.releasesSource;
        header(views, "trending".equals(source) ? "Trending releases" : "Recent releases", R.drawable.ic_widget_tv);
        click(context, views, R.id.content, items.isEmpty() ? "/" : items.get(0).path, widgetId, 0);

        String note = null;
        if (items.isEmpty()) note = entry.unavailable ? "Couldn't load releases. Check your connection." : "No new releases right now.";
        showNote(views, note, theme);

        Item[] rows = new Item[items.size()];
        for (int i = 0; i < rows.length; i++) {
            WidgetFeed.Release item = items.get(i);
            boolean out = isOut(item, entry.now);
            rows[i] = size == Size.LARGE
                ? new Item(item.id, item.path, null, item.title, releaseTiming(item, entry.now, false), out, null)
                : new Item(item.id, item.path, null, item.title, releaseTiming(item, entry.now, true), out, null);
        }
        fill(context, views, size == Size.SMALL ? Size.MEDIUM : size, rows, entry.releasePosters, theme, widgetId);
        return views;
    }

    /** The small Recent releases widget: one title, its poster filling the widget. */
    private static RemoteViews featured(Context context, WidgetFeed.Release item, FeedClient.Entry entry, int widgetId) {
        WidgetTheme theme = entry.theme;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_featured);
        background(views, theme);
        Bitmap image = entry.featuredPoster != null ? entry.featuredPoster : entry.releasePosters.get(item.id);
        // Over a poster the text is white on a dark fade; without one it uses the theme.
        boolean onImage = image != null;
        if (onImage) {
            views.setImageViewBitmap(R.id.featured_poster, image);
            views.setViewVisibility(R.id.featured_poster, View.VISIBLE);
            views.setViewVisibility(R.id.featured_fade, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.featured_poster, View.GONE);
            views.setViewVisibility(R.id.featured_fade, View.GONE);
        }
        boolean out = isOut(item, entry.now);
        String label = item.isEpisode() ? (out ? "New episode" : "Next episode") : (out ? "Just released" : "Coming soon");
        views.setTextViewText(R.id.featured_label, label);
        views.setTextViewText(R.id.featured_title, item.title);
        views.setTextColor(R.id.featured_title, onImage ? 0xFFFFFFFF : theme.text);
        views.setTextViewText(R.id.featured_detail, featuredDetail(item, entry.now));
        views.setTextColor(R.id.featured_detail, onImage ? 0xD9FFFFFF : theme.muted);
        click(context, views, R.id.content, item.path, widgetId, 0);
        return views;
    }

    /** Shows say which episode; movies and other premieres just say when. */
    private static String featuredDetail(WidgetFeed.Release item, long now) {
        boolean out = isOut(item, now);
        if (item.isEpisode()) {
            String episode = item.episode != null ? "Episode " + item.episode : "New episode";
            if (item.at == null) return episode + " · weekly";
            return out ? episode + " · " + ago(item.at.getTime(), now) : episode + " · in " + until(item.at.getTime(), now);
        }
        if (item.at == null) return "Date TBA";
        return out ? "Released " + ago(item.at.getTime(), now) : monthDay(item.at);
    }

    // ---------------------------------------------------------------------------------
    // Shared pieces
    // ---------------------------------------------------------------------------------

    private static int layoutFor(Size size) {
        return switch (size) {
            case SMALL -> R.layout.widget_small_text;
            case MEDIUM -> R.layout.widget_shelf;
            case LARGE -> R.layout.widget_rows;
        };
    }

    private static void background(RemoteViews views, WidgetTheme theme) {
        views.setInt(R.id.widget_bg, "setColorFilter", theme.background);
    }

    private static void header(RemoteViews views, String title, int icon) {
        views.setTextViewText(R.id.header_title, title);
        views.setImageViewResource(R.id.header_icon, icon);
        views.setInt(R.id.header_icon, "setColorFilter", WidgetTheme.ACCENT);
    }

    private static void showNote(RemoteViews views, String note, WidgetTheme theme) {
        if (note == null) {
            views.setViewVisibility(R.id.note, View.GONE);
            return;
        }
        views.setViewVisibility(R.id.note, View.VISIBLE);
        views.setTextViewText(R.id.note, note);
        views.setTextColor(R.id.note, theme.muted);
    }

    /** Put `items` in the layout's slots and hide the slots left over. */
    private static void fill(
        Context context,
        RemoteViews views,
        Size size,
        Item[] items,
        Map<String, Bitmap> posters,
        WidgetTheme theme,
        int widgetId
    ) {
        switch (size) {
            case SMALL -> {
                for (int i = 0; i < SMALL_IDS.length; i++) {
                    if (i >= items.length) {
                        views.setViewVisibility(SMALL_IDS[i], View.GONE);
                        continue;
                    }
                    views.setViewVisibility(SMALL_IDS[i], View.VISIBLE);
                    text(views, SMALL_LINE1[i], items[i].line1, theme.muted);
                    text(views, SMALL_LINE2[i], items[i].title, theme.text);
                }
            }
            case MEDIUM -> {
                boolean any = items.length > 0;
                views.setViewVisibility(R.id.shelf, any ? View.VISIBLE : View.GONE);
                for (int i = 0; i < TILES.length; i++) {
                    if (i >= items.length) {
                        // Keep the slot's width so the tiles stay evenly spaced.
                        views.setViewVisibility(TILES[i], View.INVISIBLE);
                        continue;
                    }
                    Item item = items[i];
                    views.setViewVisibility(TILES[i], View.VISIBLE);
                    poster(views, TILE_FILL[i], TILE_FILM[i], TILE_POSTER[i], posters.get(item.id), theme);
                    text(views, TILE_TITLE[i], item.title, theme.text);
                    text(views, TILE_DETAIL[i], item.detail, item.highlighted ? WidgetTheme.ACCENT : theme.muted);
                    click(context, views, TILES[i], item.path, widgetId, i + 1);
                }
            }
            case LARGE -> {
                for (int i = 0; i < ROWS.length; i++) {
                    if (i >= items.length) {
                        views.setViewVisibility(ROWS[i], View.GONE);
                        continue;
                    }
                    Item item = items[i];
                    views.setViewVisibility(ROWS[i], View.VISIBLE);
                    poster(views, ROW_FILL[i], ROW_FILM[i], ROW_POSTER[i], posters.get(item.id), theme);
                    text(views, ROW_LINE1[i], item.line1, theme.muted);
                    text(views, ROW_LINE2[i], item.title, theme.text);
                    text(views, ROW_DETAIL[i], item.detail, item.highlighted ? WidgetTheme.ACCENT : theme.muted);
                    text(views, ROW_TRAILING[i], item.trailing, theme.muted);
                    click(context, views, ROWS[i], item.path, widgetId, i + 1);
                }
            }
        }
    }

    /** Set a line of text, hiding the view when there's none. */
    private static void text(RemoteViews views, int id, String value, int color) {
        if (value == null) {
            views.setViewVisibility(id, View.GONE);
            return;
        }
        views.setViewVisibility(id, View.VISIBLE);
        views.setTextViewText(id, value);
        views.setTextColor(id, color);
    }

    /** A poster, or a placeholder in the theme's surface color when there's no image. */
    private static void poster(RemoteViews views, int fill, int film, int poster, Bitmap image, WidgetTheme theme) {
        views.setInt(fill, "setColorFilter", theme.surface);
        views.setInt(film, "setColorFilter", theme.muted);
        if (image != null) {
            views.setImageViewBitmap(poster, image);
            views.setViewVisibility(poster, View.VISIBLE);
        } else {
            views.setViewVisibility(poster, View.GONE);
        }
    }

    /** Tapping `viewId` opens `path` in the app. */
    private static void click(Context context, RemoteViews views, int viewId, String path, int widgetId, int slot) {
        Intent intent = new Intent(Intent.ACTION_VIEW, WidgetStore.appUri(path), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int requestCode = widgetId * 16 + slot;
        PendingIntent pending = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(viewId, pending);
    }

    // ---------------------------------------------------------------------------------
    // Wording (as the iOS widgets)
    // ---------------------------------------------------------------------------------

    /** Whether a release has come out by `now`. */
    static boolean isOut(WidgetFeed.Release item, long now) {
        return item.at != null && item.at.getTime() <= now;
    }

    /** e.g. "Ep 12 · out 2h ago", "Ep 5 · in 3d", "Premieres Oct 14"; `shortForm` for poster tiles. */
    static String releaseTiming(WidgetFeed.Release item, long now, boolean shortForm) {
        if (item.isEpisode()) {
            String episode = item.episode != null ? "Ep " + item.episode : "New ep";
            if (item.at == null) return shortForm ? episode : episode + " · airs weekly";
            long at = item.at.getTime();
            if (at <= now) return shortForm ? episode + " · " + ago(at, now) : episode + " · out " + ago(at, now);
            return episode + " · in " + until(at, now);
        }
        if (item.at == null) return shortForm ? "TBA" : "Premiere date TBA";
        if (item.at.getTime() <= now) return "Out now";
        String date = monthDay(item.at);
        return shortForm ? date : "Premieres " + date;
    }

    /** "5m ago" style. */
    static String ago(long at, long now) {
        String text = shortSpan(Math.max(0, now - at));
        return "now".equals(text) ? "just now" : text + " ago";
    }

    /** "3h" style time until `at`. */
    static String until(long at, long now) {
        return shortSpan(Math.max(0, at - now));
    }

    private static String shortSpan(long millis) {
        long minutes = millis / 60_000;
        if (minutes < 1) return "now";
        if (minutes < 60) return minutes + "m";
        long hours = minutes / 60;
        if (hours < 24) return hours + "h";
        return (hours / 24) + "d";
    }

    private static String monthDay(Date date) {
        return new SimpleDateFormat("MMM d", Locale.getDefault()).format(date);
    }
}
