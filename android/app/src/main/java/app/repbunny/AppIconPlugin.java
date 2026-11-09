package app.repbunny;

import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

// Issue #145: the web layer's handle on the home-screen icon
// (src/lib/appIcon.ts). Each theme's icon is an activity-alias of
// MainActivity named Icon<PascalCase theme id> in AndroidManifest.xml; this
// enables the picked one and disables the rest. Registered in MainActivity.
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    private static final String PREFIX = "app.repbunny.Icon";

    @PluginMethod
    public void getName(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String name = "classic";
        for (ActivityInfo alias : aliases()) {
            int state = pm.getComponentEnabledSetting(component(alias));
            boolean enabled = state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT ? alias.enabled : state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
            if (enabled) {
                name = themeId(alias.name);
                break;
            }
        }
        JSObject result = new JSObject();
        result.put("name", name);
        call.resolve(result);
    }

    @PluginMethod
    public void setName(PluginCall call) {
        String name = call.getString("name");
        List<ActivityInfo> all = aliases();
        ActivityInfo picked = null;
        for (ActivityInfo alias : all) {
            if (themeId(alias.name).equals(name)) picked = alias;
        }
        if (picked == null) {
            call.reject("No app icon called " + name);
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        // Enable the new one first so the app always has a launcher entry.
        pm.setComponentEnabledSetting(component(picked), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (ActivityInfo alias : all) {
            if (alias == picked) continue;
            pm.setComponentEnabledSetting(component(alias), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
        call.resolve();
    }

    private List<ActivityInfo> aliases() {
        List<ActivityInfo> result = new ArrayList<>();
        try {
            PackageInfo info = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), PackageManager.GET_ACTIVITIES | PackageManager.MATCH_DISABLED_COMPONENTS);
            if (info.activities != null) {
                for (ActivityInfo activity : info.activities) {
                    if (activity.name.startsWith(PREFIX)) result.add(activity);
                }
            }
        } catch (PackageManager.NameNotFoundException e) {
            // Can't happen for our own package.
        }
        return result;
    }

    private ComponentName component(ActivityInfo alias) {
        return new ComponentName(getContext().getPackageName(), alias.name);
    }

    // "app.repbunny.IconCottonCandy" -> "cotton-candy"
    private static String themeId(String className) {
        String pascal = className.substring(PREFIX.length());
        return pascal.replaceAll("([a-z0-9])([A-Z])", "$1-$2").toLowerCase(Locale.ROOT);
    }
}
