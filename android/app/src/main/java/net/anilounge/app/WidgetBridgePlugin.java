package net.anilounge.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import net.anilounge.app.widget.FeedClient;
import net.anilounge.app.widget.WidgetStore;
import net.anilounge.app.widget.WidgetTheme;
import net.anilounge.app.widget.WidgetUpdater;

/**
 * Lets the web app hand the home screen widgets (and the share target) their sign-in (a
 * widget token), tell them and the app icon which site theme is picked, and refresh them;
 * also asks for a Google Play rating and opens calendar files. The Android side of
 * ios/App/App/WidgetBridgePlugin.swift; used from src/utils/nativeApp.ts as `WidgetBridge`.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getToken(PluginCall call) {
        JSObject result = new JSObject();
        String token = WidgetStore.token(getContext());
        result.put("token", token == null ? JSObject.NULL : token);
        call.resolve(result);
    }

    @PluginMethod
    public void setToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("A token is required.");
            return;
        }
        WidgetStore.setToken(getContext(), token);
        WidgetUpdater.refreshAsync(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        WidgetStore.clearToken(getContext());
        WidgetUpdater.refreshAsync(getContext());
        call.resolve();
    }

    @PluginMethod
    public void reload(PluginCall call) {
        WidgetUpdater.refreshAsync(getContext());
        call.resolve();
    }

    /** Save the site theme for the widgets, refreshing them only when it changed. */
    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme");
        if (!WidgetTheme.isTheme(theme)) {
            call.reject("Unknown theme.");
            return;
        }
        if (WidgetStore.setTheme(getContext(), theme)) WidgetUpdater.refreshAsync(getContext());
        call.resolve();
    }

    /**
     * Switch the home screen icon to match a theme (AppIcons). The web app only calls
     * this when someone picks a theme.
     */
    @PluginMethod
    public void setAppIcon(PluginCall call) {
        String theme = call.getString("theme");
        if (!AppIcons.isTheme(theme)) {
            call.reject("Unknown theme.");
            return;
        }
        JSObject result = new JSObject();
        result.put("changed", AppIcons.choose(getContext(), theme));
        call.resolve(result);
    }

    /**
     * Ask Google Play to show its rating prompt. Play decides whether it actually appears
     * (it limits how often), so the web app only calls this for long-time users after a
     * good moment (src/utils/appReview.ts).
     */
    @PluginMethod
    public void requestReview(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app isn't in the foreground.");
            return;
        }
        ReviewManager manager = ReviewManagerFactory.create(activity);
        manager
            .requestReviewFlow()
            .addOnCompleteListener((request) -> {
                if (!request.isSuccessful()) {
                    call.reject("Google Play couldn't show the rating prompt.");
                    return;
                }
                ReviewInfo info = request.getResult();
                manager.launchReviewFlow(activity, info).addOnCompleteListener((flow) -> call.resolve());
            });
    }

    /**
     * Download an .ics file (an episode calendar) and open it in the calendar app; if no
     * app opens calendar files, the browser gets the link instead.
     */
    @PluginMethod
    public void openCalendarFile(PluginCall call) {
        String address = call.getString("url");
        if (address == null || !address.startsWith("https://")) {
            call.reject("An https URL is required.");
            return;
        }
        executor.execute(() -> {
            File file;
            try {
                file = download(address);
            } catch (Exception error) {
                call.reject("Couldn't download the calendar.");
                return;
            }
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("The app isn't in the foreground.");
                return;
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
            activity.runOnUiThread(() -> {
                Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "text/calendar").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    activity.startActivity(view);
                } catch (ActivityNotFoundException noCalendar) {
                    try {
                        activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address)));
                    } catch (ActivityNotFoundException noBrowser) {
                        call.reject("No app can open calendar files.");
                        return;
                    }
                }
                call.resolve();
            });
        });
    }

    private File download(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        try {
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "text/calendar");
            if (connection.getResponseCode() != 200) throw new IllegalStateException("HTTP " + connection.getResponseCode());
            byte[] bytes = FeedClient.read(connection.getInputStream());
            File folder = new File(getContext().getCacheDir(), "calendars");
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IllegalStateException("No cache folder");
            File file = new File(folder, "AniLounge.ics");
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            return file;
        } finally {
            connection.disconnect();
        }
    }
}
