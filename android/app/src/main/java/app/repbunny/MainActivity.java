package app.repbunny;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (not from npm) register before the bridge starts.
        registerPlugin(RestActivityPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(HomeWidgetsPlugin.class);
        registerPlugin(BackupFolderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
