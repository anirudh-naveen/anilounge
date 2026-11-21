package net.anilounge.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Home screen icons per site theme, as iOS's alternate app icons. Each icon is a launcher
 * activity-alias of MainActivity (AndroidManifest.xml); exactly one is enabled. Switching
 * aliases can make some launchers close the app, so a pick is saved and applied when the
 * app goes to the background (MainActivity.onStop).
 */
final class AppIcons {

    /** Theme → alias. The light theme uses the main icon, as on iOS. */
    private static final Map<String, String> ALIASES = new LinkedHashMap<>();

    static {
        ALIASES.put("light", ".LauncherDefault");
        ALIASES.put("dawn", ".LauncherDawn");
        ALIASES.put("penumbra", ".LauncherPenumbra");
        ALIASES.put("dusk", ".LauncherDusk");
        ALIASES.put("dark", ".LauncherDark");
    }

    /** The alias enabled in the manifest. */
    private static final String DEFAULT_ALIAS = ".LauncherDefault";

    private static final String PREFS = "anilounge_app_icon";
    private static final String PENDING_KEY = "pendingAlias";

    private AppIcons() {}

    static boolean isTheme(String theme) {
        return theme != null && ALIASES.containsKey(theme);
    }

    private static ComponentName component(Context context, String alias) {
        return new ComponentName(context.getPackageName(), context.getPackageName() + alias);
    }

    private static boolean isEnabled(Context context, String alias) {
        int state = context.getPackageManager().getComponentEnabledSetting(component(context, alias));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return DEFAULT_ALIAS.equals(alias);
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Pick the icon for a theme (applied once the app is in the background).
     * @return Whether it will change.
     */
    static boolean choose(Context context, String theme) {
        String alias = ALIASES.get(theme);
        if (alias == null) return false;
        if (isEnabled(context, alias)) {
            prefs(context).edit().remove(PENDING_KEY).apply();
            return false;
        }
        prefs(context).edit().putString(PENDING_KEY, alias).apply();
        return true;
    }

    /** Switch to the picked icon, if one is waiting. */
    static void applyPending(Context context) {
        String alias = prefs(context).getString(PENDING_KEY, null);
        if (alias == null) return;
        prefs(context).edit().remove(PENDING_KEY).apply();
        PackageManager manager = context.getPackageManager();
        // Enable the new one first, so there's always a launcher icon.
        manager.setComponentEnabledSetting(
            component(context, alias),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        );
        for (String other : ALIASES.values()) {
            if (other.equals(alias)) continue;
            manager.setComponentEnabledSetting(
                component(context, other),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
        }
    }
}
