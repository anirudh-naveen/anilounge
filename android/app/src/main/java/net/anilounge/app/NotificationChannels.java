package net.anilounge.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * One notification channel per kind of push, matching Settings → Notifications on the
 * site (backend: services/pushService.js sends each push to its kind's channel). Android
 * also lets people mute a channel in its own settings.
 */
final class NotificationChannels {

    private NotificationChannels() {}

    static void create(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        add(context, manager, "friends", R.string.channel_friends, R.string.channel_friends_description);
        add(context, manager, "forum", R.string.channel_forum, R.string.channel_forum_description);
        add(context, manager, "messages", R.string.channel_messages, R.string.channel_messages_description);
        add(context, manager, "releases", R.string.channel_releases, R.string.channel_releases_description);
    }

    private static void add(Context context, NotificationManager manager, String id, int name, int description) {
        // High importance: shown as a banner, as on iOS.
        NotificationChannel channel = new NotificationChannel(id, context.getString(name), NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(context.getString(description));
        manager.createNotificationChannel(channel);
    }
}
