package net.anilounge.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/**
 * Both widgets refresh the same way: load the feed off the main thread (the broadcast
 * stays alive until it's done) and redraw every placed widget.
 */
public abstract class FeedWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        refresh(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int widgetId, Bundle options) {
        // Resized: older Android needs the layout for the new size.
        refresh(context);
    }

    private void refresh(Context context) {
        PendingResult pending = goAsync();
        WidgetUpdater.refreshAsync(context, pending::finish);
    }
}
