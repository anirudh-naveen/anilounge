package net.anilounge.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Loads the feed once and redraws every placed widget. The widgets refresh about every
 * 30 minutes (updatePeriodMillis in res/xml/widget_*.xml); the app also asks for a
 * refresh when the watchlist, sign-in, or theme changes (WidgetBridgePlugin).
 */
public final class WidgetUpdater {

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    /** Smallest size each layout fits (dp), for launchers that pick a layout by size. */
    private static final SizeF SMALL = new SizeF(100f, 100f);
    private static final SizeF MEDIUM = new SizeF(240f, 100f);
    private static final SizeF LARGE = new SizeF(240f, 270f);

    private WidgetUpdater() {}

    /** Refresh every widget in the background. */
    public static void refreshAsync(Context context) {
        refreshAsync(context, null);
    }

    /** Refresh every widget in the background, then run `done` (on the worker thread). */
    public static void refreshAsync(Context context, Runnable done) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                refresh(app);
            } catch (Exception ignored) {
                // A failed refresh leaves the widgets as they were.
            } finally {
                if (done != null) done.run();
            }
        });
    }

    /** Fetch the feed and redraw every widget. Blocking. */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] watchlist = manager.getAppWidgetIds(new ComponentName(context, WatchlistWidgetProvider.class));
        int[] releases = manager.getAppWidgetIds(new ComponentName(context, ReleasesWidgetProvider.class));
        if (watchlist.length == 0 && releases.length == 0) return;
        FeedClient.Entry entry = FeedClient.load(context, watchlist.length > 0, releases.length > 0);
        for (int id : watchlist) manager.updateAppWidget(id, views(context, manager, WidgetRenderer.Kind.WATCHLIST, entry, id));
        for (int id : releases) manager.updateAppWidget(id, views(context, manager, WidgetRenderer.Kind.RELEASES, entry, id));
    }

    private static RemoteViews views(
        Context context,
        AppWidgetManager manager,
        WidgetRenderer.Kind kind,
        FeedClient.Entry entry,
        int widgetId
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: hand over every size; the launcher shows the one that fits.
            Map<SizeF, RemoteViews> sizes = new HashMap<>();
            sizes.put(SMALL, WidgetRenderer.render(context, kind, WidgetRenderer.Size.SMALL, entry, widgetId));
            sizes.put(MEDIUM, WidgetRenderer.render(context, kind, WidgetRenderer.Size.MEDIUM, entry, widgetId));
            sizes.put(LARGE, WidgetRenderer.render(context, kind, WidgetRenderer.Size.LARGE, entry, widgetId));
            return new RemoteViews(sizes);
        }
        return WidgetRenderer.render(context, kind, sizeOf(manager.getAppWidgetOptions(widgetId)), entry, widgetId);
    }

    /** Older Android: pick a layout from the widget's current size (portrait). */
    private static WidgetRenderer.Size sizeOf(Bundle options) {
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110);
        if (width < MEDIUM.getWidth()) return WidgetRenderer.Size.SMALL;
        if (height < LARGE.getHeight()) return WidgetRenderer.Size.MEDIUM;
        return WidgetRenderer.Size.LARGE;
    }
}
