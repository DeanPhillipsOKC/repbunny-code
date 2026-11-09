package app.repbunny;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

// Issue #144: the Latest record home screen widget (HomeWidgets.java draws it).
public class RecordWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        HomeWidgets.update(context, manager, ids, HomeWidgets.RECORD);
    }
}