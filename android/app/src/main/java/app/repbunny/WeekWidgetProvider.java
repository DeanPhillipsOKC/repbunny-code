package app.repbunny;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

// Issue #144: the This week home screen widget (HomeWidgets.java draws it).
public class WeekWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        HomeWidgets.update(context, manager, ids, HomeWidgets.WEEK);
    }
}