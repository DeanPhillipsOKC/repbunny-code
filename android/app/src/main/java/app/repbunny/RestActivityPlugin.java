package app.repbunny;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import org.json.JSONException;
import org.json.JSONObject;

// Issue #143: the web layer's handle on the lock-screen rest timer
// (src/lib/restLive.ts). Registered in MainActivity.
@CapacitorPlugin(name = "RestActivity")
public class RestActivityPlugin extends Plugin {
    private static WeakReference<RestActivityPlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
        RestLive.createChannels(getContext());
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            RestLive.start(getContext(), new JSONObject(call.getData().toString()));
            call.resolve();
        } catch (JSONException e) {
            call.reject("Couldn't start the rest timer", e);
        }
    }

    @PluginMethod
    public void end(PluginCall call) {
        RestLive.end(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        JSONObject rest = RestLive.load(getContext());
        try {
            result.put("rest", rest == null ? JSONObject.NULL : JSObject.fromJSONObject(rest));
        } catch (JSONException e) {
            result.put("rest", JSONObject.NULL);
        }
        call.resolve(result);
    }

    // Issue #166: the rest screen shows over the lock screen while it's up,
    // like Maps during navigation. The web layer turns it off as soon as the
    // rest screen goes away, so nothing else is reachable without unlocking.
    @PluginMethod
    public void setShowWhenLocked(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(enabled);
            } else if (enabled) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
            }
            call.resolve();
        });
    }

    // Issue #339: RepBunny's notification settings, for when alerts are off.
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Activity activity = getActivity();
        String pkg = activity.getPackageName();
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Couldn't open notification settings", e);
        }
    }

    // Asks for the PIN or fingerprint before leaving the rest screen. Resolves
    // { unlocked: true } right away when the phone isn't locked.
    @PluginMethod
    public void requestUnlock(PluginCall call) {
        Activity activity = getActivity();
        KeyguardManager keyguard = activity.getSystemService(KeyguardManager.class);
        if (!keyguard.isKeyguardLocked()) {
            resolveUnlock(call, true);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            resolveUnlock(call, false);
            return;
        }
        activity.runOnUiThread(() ->
            keyguard.requestDismissKeyguard(activity, new KeyguardManager.KeyguardDismissCallback() {
                @Override
                public void onDismissSucceeded() {
                    resolveUnlock(call, true);
                }

                @Override
                public void onDismissCancelled() {
                    resolveUnlock(call, false);
                }

                @Override
                public void onDismissError() {
                    resolveUnlock(call, false);
                }
            })
        );
    }

    private static void resolveUnlock(PluginCall call, boolean unlocked) {
        JSObject result = new JSObject();
        result.put("unlocked", unlocked);
        call.resolve(result);
    }

    // Called from RestActionReceiver; a no-op while the app isn't running.
    static void emit(String action) {
        RestActivityPlugin plugin = instance.get();
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("restAction", data);
    }
}
