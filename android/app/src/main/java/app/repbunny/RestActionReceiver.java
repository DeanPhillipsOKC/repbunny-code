package app.repbunny;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Issue #143: the lock-screen timer's +15s and Skip buttons, and the alarm
// at the rest's end. Works with the app killed; if it's running, the web
// layer hears about it right away (RestActivityPlugin.emit).
public class RestActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (RestLive.ACTION_ADD.equals(action)) {
            if (RestLive.addTime(context)) RestActivityPlugin.emit("add");
        } else if (RestLive.ACTION_SKIP.equals(action)) {
            if (RestLive.skip(context)) RestActivityPlugin.emit("skip");
        } else if (RestLive.ACTION_DONE.equals(action)) {
            if (RestLive.done(context)) RestActivityPlugin.emit("done");
        }
    }
}
