package app.repbunny;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

// Issue #144: draws the three home screen widgets from the snapshot the app
// writes (src/lib/widgetSnapshot.ts). Every string and color comes from the
// snapshot; the only copy here is the "open the app first" message for a
// widget added before the app has written one. Widgets never read the
// database.
final class HomeWidgets {
    static final String ACTION = "app.repbunny.WIDGET_ACTION";
    static final String EXTRA_ACTION = "widgetAction";
    static final String EXTRA_TEMPLATE_ID = "templateId";
    static final String EXTRA_PATH = "path";

    static final String WEEK = "week";
    static final String NEXT = "next";
    static final String RECORD = "record";

    private static final String PREFS = "repbunny_widgets";
    private static final String KEY = "snapshot";

    private static final int[] MARKS = { R.id.mark0, R.id.mark1, R.id.mark2, R.id.mark3, R.id.mark4, R.id.mark5, R.id.mark6 };
    private static final int[] LETTERS = { R.id.letter0, R.id.letter1, R.id.letter2, R.id.letter3, R.id.letter4, R.id.letter5, R.id.letter6 };

    private HomeWidgets() {}

    static void save(Context context, String snapshot) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, snapshot).apply();
        updateAll(context);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        update(context, manager, ids(context, manager, WeekWidgetProvider.class), WEEK);
        update(context, manager, ids(context, manager, NextWorkoutWidgetProvider.class), NEXT);
        update(context, manager, ids(context, manager, RecordWidgetProvider.class), RECORD);
    }

    static void update(Context context, AppWidgetManager manager, int[] ids, String kind) {
        if (ids.length == 0) return;
        manager.updateAppWidget(ids, build(context, kind, load(context)));
    }

    private static int[] ids(Context context, AppWidgetManager manager, Class<?> provider) {
        return manager.getAppWidgetIds(new ComponentName(context, provider));
    }

    private static JSONObject load(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private static RemoteViews build(Context context, String kind, JSONObject snapshot) {
        if (snapshot == null) {
            return message(context, kind, null, context.getString(R.string.widget_brand), context.getString(R.string.widget_setup), open(context, kind, "/"));
        }
        JSONObject colors = snapshot.optJSONObject("colors");
        JSONObject copy = snapshot.optJSONObject("copy");
        if (!snapshot.optBoolean("premium")) {
            return message(context, kind, colors, copy.optString("premiumTitle"), copy.optString("premiumText"), premium(context, kind));
        }
        switch (kind) {
            case WEEK:
                return week(context, snapshot, colors, copy);
            case NEXT:
                return next(context, snapshot, colors, copy);
            default:
                return record(context, snapshot, colors, copy);
        }
    }

    private static RemoteViews week(Context context, JSONObject snapshot, JSONObject colors, JSONObject copy) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_week);
        background(views, colors);
        views.setTextViewText(R.id.title, copy.optString("weekTitle"));
        views.setTextColor(R.id.title, color(colors, "textDim"));

        JSONObject week = snapshot.optJSONObject("week");
        // A snapshot from an earlier week shows an empty week until the app
        // writes a new one.
        boolean current = week != null && week.optLong("start") == startOfWeek();
        JSONArray days = current ? week.optJSONArray("days") : null;
        int count = current ? week.optInt("count") : 0;
        views.setTextViewText(R.id.count, String.valueOf(count));
        views.setTextColor(R.id.count, color(colors, "accent"));
        views.setTextViewText(R.id.count_label, current ? week.optString("label") : "workouts");
        views.setTextColor(R.id.count_label, color(colors, "text"));

        String mark = snapshot.optString("dayMark", "paw");
        int today = Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1;
        for (int day = 0; day < 7; day++) {
            boolean done = days != null && days.optBoolean(day);
            if (done) {
                views.setImageViewResource(MARKS[day], markResource(mark));
                // Only the paw takes the accent; the others bring their own colors.
                views.setInt(MARKS[day], "setColorFilter", mark.equals("paw") ? color(colors, "accent") : Color.TRANSPARENT);
            } else {
                views.setImageViewResource(MARKS[day], R.drawable.widget_dot);
                views.setInt(MARKS[day], "setColorFilter", color(colors, "border"));
            }
            views.setTextColor(LETTERS[day], day == today ? color(colors, "accent") : color(colors, "textDim"));
        }
        views.setOnClickPendingIntent(R.id.root, open(context, WEEK, "/"));
        return views;
    }

    private static RemoteViews next(Context context, JSONObject snapshot, JSONObject colors, JSONObject copy) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_next);
        background(views, colors);
        views.setTextViewText(R.id.title, copy.optString("nextTitle"));
        views.setTextColor(R.id.title, color(colors, "textDim"));
        JSONObject next = snapshot.optJSONObject("next");
        views.setTextColor(R.id.name, color(colors, "text"));
        views.setTextColor(R.id.sub, color(colors, "textDim"));
        if (next == null) {
            views.setTextViewText(R.id.name, copy.optString("nextEmpty"));
            views.setTextViewText(R.id.sub, copy.optString("nextEmptySub"));
            views.setViewVisibility(R.id.start, View.GONE);
            views.setOnClickPendingIntent(R.id.root, open(context, NEXT, "/templates"));
            return views;
        }
        views.setTextViewText(R.id.name, next.optString("name"));
        views.setTextViewText(R.id.sub, next.optString("sub"));
        views.setViewVisibility(R.id.start, View.VISIBLE);
        views.setInt(R.id.start_bg, "setColorFilter", color(colors, "accent"));
        views.setTextViewText(R.id.start_label, copy.optString("start"));
        views.setTextColor(R.id.start_label, color(colors, "accentText"));
        views.setOnClickPendingIntent(R.id.root, start(context, next.optString("templateId")));
        return views;
    }

    private static RemoteViews record(Context context, JSONObject snapshot, JSONObject colors, JSONObject copy) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_record);
        background(views, colors);
        views.setTextViewText(R.id.title, copy.optString("recordTitle"));
        views.setTextColor(R.id.title, color(colors, "textDim"));
        JSONObject record = snapshot.optJSONObject("record");
        views.setTextColor(R.id.name, color(colors, "text"));
        views.setTextColor(R.id.detail, color(colors, "accent"));
        views.setTextColor(R.id.date, color(colors, "textDim"));
        if (record == null) {
            views.setTextViewText(R.id.name, copy.optString("recordEmpty"));
            views.setTextViewText(R.id.detail, "");
            views.setTextViewText(R.id.date, copy.optString("recordEmptySub"));
        } else {
            views.setTextViewText(R.id.name, record.optString("exerciseName"));
            views.setTextViewText(R.id.detail, record.optString("detail"));
            views.setTextViewText(R.id.date, record.optString("date"));
        }
        views.setOnClickPendingIntent(R.id.root, open(context, RECORD, "/progress"));
        return views;
    }

    // The free placeholder, and the "open the app first" message.
    private static RemoteViews message(Context context, String kind, JSONObject colors, String heading, String text, PendingIntent tap) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_message);
        background(views, colors);
        views.setTextViewText(R.id.title, title(context, kind));
        views.setTextColor(R.id.title, color(colors, "textDim"));
        views.setTextViewText(R.id.heading, heading);
        views.setTextColor(R.id.heading, color(colors, "accent"));
        views.setTextViewText(R.id.text, text);
        views.setTextColor(R.id.text, color(colors, "text"));
        views.setOnClickPendingIntent(R.id.root, tap);
        return views;
    }

    private static String title(Context context, String kind) {
        switch (kind) {
            case WEEK:
                return context.getString(R.string.widget_week_label);
            case NEXT:
                return context.getString(R.string.widget_next_label);
            default:
                return context.getString(R.string.widget_record_label);
        }
    }

    private static void background(RemoteViews views, JSONObject colors) {
        views.setInt(R.id.background, "setColorFilter", color(colors, "surface"));
    }

    // Classic's colors stand in until the app has written a snapshot.
    private static int color(JSONObject colors, String key) {
        String fallback;
        switch (key) {
            case "surface":
                fallback = "#211829";
                break;
            case "border":
                fallback = "#3a2b40";
                break;
            case "text":
                fallback = "#f5edf2";
                break;
            case "textDim":
                fallback = "#b9a8c2";
                break;
            case "accentText":
                fallback = "#241a2c";
                break;
            default:
                fallback = "#f2879c";
        }
        String value = colors == null ? fallback : colors.optString(key, fallback);
        try {
            return Color.parseColor(value);
        } catch (IllegalArgumentException e) {
            return Color.parseColor(fallback);
        }
    }

    private static int markResource(String mark) {
        switch (mark) {
            case "candy-corn":
                return R.drawable.day_mark_candy_corn;
            case "maple-leaf":
                return R.drawable.day_mark_maple_leaf;
            case "carrot":
                return R.drawable.day_mark_carrot;
            case "candy-cane":
                return R.drawable.day_mark_candy_cane;
            case "candy-heart":
                return R.drawable.day_mark_candy_heart;
            default:
                return R.drawable.day_mark_paw;
        }
    }

    // Sunday 12:00 AM local, matching startOfWeek in src/lib/progressHub.ts.
    private static long startOfWeek() {
        Calendar start = Calendar.getInstance();
        start.set(Calendar.HOUR_OF_DAY, 0);
        start.set(Calendar.MINUTE, 0);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        start.add(Calendar.DAY_OF_MONTH, -(start.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY));
        return start.getTimeInMillis();
    }

    private static PendingIntent start(Context context, String templateId) {
        Intent intent = launch(context, "start/" + templateId);
        intent.putExtra(EXTRA_ACTION, "start");
        intent.putExtra(EXTRA_TEMPLATE_ID, templateId);
        return pending(context, intent);
    }

    private static PendingIntent premium(Context context, String kind) {
        Intent intent = launch(context, "premium/" + kind);
        intent.putExtra(EXTRA_ACTION, "premium");
        return pending(context, intent);
    }

    private static PendingIntent open(Context context, String kind, String path) {
        Intent intent = launch(context, "open/" + kind);
        intent.putExtra(EXTRA_ACTION, "open");
        intent.putExtra(EXTRA_PATH, path);
        return pending(context, intent);
    }

    // A distinct data URI per tap target, so each widget keeps its own
    // PendingIntent instead of sharing one with different extras.
    private static Intent launch(Context context, String key) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(ACTION);
        intent.setData(Uri.parse("repbunny-widget://" + key));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    private static PendingIntent pending(Context context, Intent intent) {
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
