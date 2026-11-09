package app.repbunny;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONException;
import org.json.JSONObject;

// Issue #143 (Premium): the rest timer on the lock screen. An ongoing
// notification counts down to the rest's end with +15s and Skip buttons,
// and an alarm at the end swaps it for the "Rest is over" alert (standing in
// for #78's one-shot alert, so +15s moves it even with the app asleep).
//
// The running rest is kept in SharedPreferences, so the buttons work while
// the app is suspended or killed; the app reads it back (getState) and
// reconciles (src/lib/restLiveState.ts, whose addRestTime this mirrors).
// The web layer passes every string shown here.
final class RestLive {
    static final String ACTION_ADD = "app.repbunny.REST_ADD";
    static final String ACTION_SKIP = "app.repbunny.REST_SKIP";
    static final String ACTION_DONE = "app.repbunny.REST_DONE";

    // #78's alert uses ID 1 through @capacitor/local-notifications.
    private static final int NOTIFICATION_ID = 143;
    // Default importance, made quiet: Pixels hide low-importance ("silent")
    // notifications from the lock screen by default, which is the whole point
    // here. Replaced the first build's low-importance "rest_live" channel,
    // whose importance can't be raised once created.
    private static final String LIVE_CHANNEL = "rest_countdown";
    private static final String OLD_LIVE_CHANNEL = "rest_live";
    private static final String DONE_CHANNEL = "rest_done";
    private static final String PREFS = "repbunny_rest_live";
    private static final String KEY_STATE = "state";
    private static final int ADD_SECONDS = 15;
    private static final int ACCENT = 0xFFF2879C;

    private RestLive() {}

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.deleteNotificationChannel(OLD_LIVE_CHANNEL);
        NotificationChannel live = new NotificationChannel(LIVE_CHANNEL, "Rest timer countdown", NotificationManager.IMPORTANCE_DEFAULT);
        live.setDescription("The countdown on your lock screen while you rest.");
        live.setSound(null, null);
        live.enableVibration(false);
        live.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        live.setShowBadge(false);
        manager.createNotificationChannel(live);
        NotificationChannel done = new NotificationChannel(DONE_CHANNEL, "Rest is over", NotificationManager.IMPORTANCE_HIGH);
        done.setDescription("Lets you know when your rest is over.");
        manager.createNotificationChannel(done);
    }

    static JSONObject load(Context context) {
        String raw = prefs(context).getString(KEY_STATE, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    static void start(Context context, JSONObject rest) throws JSONException {
        rest.put("status", "running");
        save(context, rest);
        showCountdown(context, rest);
        scheduleEnd(context, rest.optLong("endsAt"));
    }

    // Ends the countdown, its alarm, and any alert it already posted.
    static void end(Context context) {
        cancelEnd(context);
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
        prefs(context).edit().remove(KEY_STATE).apply();
    }

    static boolean addTime(Context context) {
        JSONObject rest = load(context);
        if (rest == null || !"running".equals(rest.optString("status"))) return false;
        long now = System.currentTimeMillis();
        long endsAt = Math.max(now, rest.optLong("endsAt")) + ADD_SECONDS * 1000L;
        int left = (int) Math.ceil((endsAt - now) / 1000.0);
        try {
            rest.put("endsAt", endsAt);
            rest.put("totalSeconds", Math.max(rest.optInt("totalSeconds"), left));
        } catch (JSONException e) {
            return false;
        }
        save(context, rest);
        showCountdown(context, rest);
        scheduleEnd(context, endsAt);
        return true;
    }

    // Kept as "skipped" (not cleared) so the app can tell this rest was
    // skipped; the app clears it once it catches up.
    static boolean skip(Context context) {
        JSONObject rest = load(context);
        if (rest == null || !"running".equals(rest.optString("status"))) return false;
        try {
            rest.put("status", "skipped");
        } catch (JSONException e) {
            return false;
        }
        save(context, rest);
        cancelEnd(context);
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
        return true;
    }

    static boolean done(Context context) {
        JSONObject rest = load(context);
        if (rest == null || !"running".equals(rest.optString("status"))) return false;
        // A stale alarm from before a +15s.
        if (System.currentTimeMillis() < rest.optLong("endsAt") - 1000) return false;
        try {
            rest.put("status", "done");
        } catch (JSONException e) {
            return false;
        }
        save(context, rest);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, DONE_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rest)
            .setColor(ACCENT)
            .setContentTitle(rest.optString("alertTitle"))
            .setContentText(rest.optString("alertBody"))
            .setContentIntent(openApp(context))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        post(context, builder);
        return true;
    }

    private static void showCountdown(Context context, JSONObject rest) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, LIVE_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rest)
            .setColor(ACCENT)
            .setContentTitle(rest.optString("title"))
            .setContentText(rest.optString("text"))
            .setContentIntent(openApp(context))
            .setWhen(rest.optLong("endsAt"))
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, "+15s", broadcast(context, ACTION_ADD))
            .addAction(0, "Skip", broadcast(context, ACTION_SKIP));
        post(context, builder);
    }

    private static void post(Context context, NotificationCompat.Builder builder) {
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // Notifications are off; the web layer only starts this once they're allowed.
        }
    }

    // Exact when Alarms & reminders is allowed, like #78's alert; otherwise
    // the system may hold it back a little.
    private static void scheduleEnd(Context context, long endsAt) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent intent = broadcast(context, ACTION_DONE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, intent);
        } else {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, intent);
        }
    }

    private static void cancelEnd(Context context) {
        context.getSystemService(AlarmManager.class).cancel(broadcast(context, ACTION_DONE));
    }

    private static PendingIntent broadcast(Context context, String action) {
        Intent intent = new Intent(context, RestActionReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, action.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void save(Context context, JSONObject rest) {
        prefs(context).edit().putString(KEY_STATE, rest.toString()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
