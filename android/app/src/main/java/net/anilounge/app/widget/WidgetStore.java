package net.anilounge.app.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.net.Uri;

/**
 * What the app, its widgets, and its share target share (the Android side of
 * ios/App/AniLoungeWidgets/WidgetShared.swift). Everything runs in the app's own process,
 * so private SharedPreferences stand in for the iOS App Group.
 */
public final class WidgetStore {

    private static final String PREFS = "anilounge_widgets";
    /** The widget token the signed-in app stores for the widgets (backend: services/widgetService.js). */
    private static final String TOKEN_KEY = "widgetToken";
    /** The site theme the app last saved (WidgetTheme reads it). */
    private static final String THEME_KEY = "widgetTheme";
    /** The last feed that loaded, for showing while offline. */
    private static final String CACHE_KEY = "widgetFeedCache";

    private static final String SITE = "https://www.anilounge.net";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String token(Context context) {
        return prefs(context).getString(TOKEN_KEY, null);
    }

    public static void setToken(Context context, String token) {
        prefs(context).edit().putString(TOKEN_KEY, token).apply();
    }

    public static void clearToken(Context context) {
        prefs(context).edit().remove(TOKEN_KEY).apply();
    }

    public static String theme(Context context) {
        return prefs(context).getString(THEME_KEY, null);
    }

    /** @return Whether the theme changed. */
    public static boolean setTheme(Context context, String theme) {
        if (theme.equals(theme(context))) return false;
        prefs(context).edit().putString(THEME_KEY, theme).apply();
        return true;
    }

    public static String cachedFeed(Context context) {
        return prefs(context).getString(CACHE_KEY, null);
    }

    public static void setCachedFeed(Context context, String json) {
        prefs(context).edit().putString(CACHE_KEY, json).apply();
    }

    private static boolean debuggable(Context context) {
        return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /**
     * An API endpoint, e.g. {@code api(context, "widget/feed")}. Debug builds can use a
     * local API instead by setting "apiBaseURL" in these preferences (e.g.
     * {@code http://10.0.2.2:5000/api/}, the Mac as seen from the emulator).
     */
    public static String api(Context context, String path) {
        if (debuggable(context)) {
            String base = prefs(context).getString("apiBaseURL", null);
            if (base != null && !base.isEmpty()) return base + path;
        }
        return SITE + "/api/" + path;
    }

    /** Widget taps open {@code anilounge://app/<path>}; the app routes that path (src/utils/nativeApp.ts). */
    public static Uri appUri(String path) {
        String clean = path == null || path.isEmpty() ? "/" : path.startsWith("/") ? path : "/" + path;
        return Uri.parse("anilounge://app" + clean);
    }
}
