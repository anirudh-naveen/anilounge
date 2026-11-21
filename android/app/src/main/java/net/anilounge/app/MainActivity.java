package net.anilounge.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** The app's web view activity, plus the plugin and setup that live in this app's own code. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
        NotificationChannels.create(this);
    }

    @Override
    public void onStop() {
        super.onStop();
        // A theme icon picked in Settings switches once the app is out of sight.
        AppIcons.applyPending(this);
    }
}
