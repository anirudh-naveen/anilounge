package net.anilounge.app.widget;

import android.content.Context;

/**
 * The site themes (src/composables/useTheme.ts), so widgets match the app. Colors mirror
 * src/assets/styles/global.css and ios/App/AniLoungeWidgets/WidgetTheme.swift.
 */
public enum WidgetTheme {
    LIGHT(0xFFF4F5F7, 0xFFECEEF2, 0xFF152238, 0xFF5B6578),
    DAWN(0xFFF8EFE8, 0xFFF3E5DC, 0xFF3A2A3F, 0xFF75606E),
    PENUMBRA(0xFF3A4253, 0xFF414A5D, 0xFFF1F3F7, 0xFFC9CFDB),
    DUSK(0xFF1F1830, 0xFF261E3A, 0xFFF1EBF7, 0xFFC3B6D3),
    DARK(0xFF0F1726, 0xFF172133, 0xFFE8EDF5, 0xFFAAB3C5);

    /** {@code --coral-primary} (the same in every theme). */
    public static final int ACCENT = 0xFFE07A5F;

    /** {@code --bg-primary} */
    public final int background;
    /** {@code --bg-secondary}: poster placeholders. */
    public final int surface;
    /** {@code --text-primary} */
    public final int text;
    /** {@code --text-secondary} */
    public final int muted;

    WidgetTheme(int background, int surface, int text, int muted) {
        this.background = background;
        this.surface = surface;
        this.text = text;
        this.muted = muted;
    }

    /** Whether a name is one of the site's themes ("light", "dawn", ...). */
    public static boolean isTheme(String name) {
        return from(name) != null;
    }

    private static WidgetTheme from(String name) {
        if (name == null) return null;
        for (WidgetTheme theme : values()) {
            if (theme.name().equalsIgnoreCase(name)) return theme;
        }
        return null;
    }

    /** The theme the app last saved (the site's default, dark, until one is picked). */
    public static WidgetTheme current(Context context) {
        WidgetTheme theme = from(WidgetStore.theme(context));
        return theme == null ? DARK : theme;
    }
}
