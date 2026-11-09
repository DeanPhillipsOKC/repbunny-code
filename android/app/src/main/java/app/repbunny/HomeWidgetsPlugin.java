package app.repbunny;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Issue #144: the web layer's handle on the home screen widgets
// (src/lib/homeWidgets.ts). `update` stores the app's JSON snapshot and
// redraws every widget from it (HomeWidgets.java). A tap on a widget opens
// MainActivity with a widget action; this hands it to the web layer as a
// `widgetAction` event, kept until a listener is added so a tap that cold
// starts the app still lands. Registered in MainActivity.
@CapacitorPlugin(name = "HomeWidgets")
public class HomeWidgetsPlugin extends Plugin {
    @Override
    public void load() {
        if (getActivity() != null) handleWidgetIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleWidgetIntent(intent);
    }

    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        HomeWidgets.save(getContext(), snapshot);
        call.resolve();
    }

    private void handleWidgetIntent(Intent intent) {
        if (intent == null || !HomeWidgets.ACTION.equals(intent.getAction())) return;
        String action = intent.getStringExtra(HomeWidgets.EXTRA_ACTION);
        if (action == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        String templateId = intent.getStringExtra(HomeWidgets.EXTRA_TEMPLATE_ID);
        if (templateId != null) data.put("templateId", templateId);
        String path = intent.getStringExtra(HomeWidgets.EXTRA_PATH);
        if (path != null) data.put("path", path);
        // Handled once: a recreated activity keeps its intent.
        intent.removeExtra(HomeWidgets.EXTRA_ACTION);
        notifyListeners("widgetAction", data, true);
    }
}
