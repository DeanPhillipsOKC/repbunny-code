package app.repbunny;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.annotation.ChecksSdkIntAtLeast;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import org.json.JSONObject;

// Issue #874: the automatic copy's default folder, the one the app picks so
// the copy is on with no question. BackupFolderPlugin uses it whenever the
// person hasn't picked a folder of their own.
// - Android 10 and up: Documents/RepBunny in shared storage, through
//   MediaStore, with no permission needed. It survives deleting the app. An
//   app only sees its own MediaStore entries, so each file's URI is kept by
//   name in SharedPreferences; a name an older install left behind gets
//   " (1)" from MediaStore instead of being overwritten, and a new install
//   reads the old files only after the person picks the folder (Find my
//   copies on the setup welcome).
// - Android 7 to 9: the app's own external files folder, plain file access.
final class BackupDefaultFolder {
    private static final String PREFS = "backup_folder";
    private static final String ENTRIES = "default_entries";
    static final String RELATIVE_PATH = Environment.DIRECTORY_DOCUMENTS + "/RepBunny";

    private final Context context;

    BackupDefaultFolder(Context context) {
        this.context = context;
    }

    @ChecksSdkIntAtLeast(api = Build.VERSION_CODES.Q)
    static boolean usesMediaStore() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
    }

    JSObject info() {
        JSObject result = new JSObject();
        result.put("name", usesMediaStore() ? "Documents › RepBunny" : "RepBunny's folder on this phone");
        result.put("local", true);
        return result;
    }

    boolean reachable() {
        if (usesMediaStore()) return Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState());
        File dir = legacyDir();
        return dir != null && (dir.isDirectory() || dir.mkdirs());
    }

    void write(String name, String text) throws Exception {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (!usesMediaStore()) {
            try (OutputStream out = new FileOutputStream(legacyFile(name))) {
                out.write(bytes);
            }
            return;
        }
        ContentResolver resolver = context.getContentResolver();
        Uri file = entry(name);
        if (file != null) {
            // "wt" truncates, so a shorter copy doesn't leave the old tail
            // behind. A stale entry (the file was deleted, or the URI came
            // back with an app backup) falls through to a new file.
            try (OutputStream out = resolver.openOutputStream(file, "wt")) {
                if (out != null) {
                    out.write(bytes);
                    return;
                }
            } catch (Exception stale) {
                forget(name);
            }
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, RELATIVE_PATH);
        file = resolver.insert(MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
        if (file == null) throw new IllegalStateException("The folder refused a new file");
        try (OutputStream out = resolver.openOutputStream(file, "wt")) {
            if (out == null) throw new IllegalStateException("The file couldn't be opened");
            out.write(bytes);
        }
        remember(name, file);
    }

    String read(String name) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream in = open(name)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) bytes.write(buffer, 0, read);
        }
        return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
    }

    JSArray list() throws Exception {
        JSArray files = new JSArray();
        if (!usesMediaStore()) {
            File[] children = legacyDir().listFiles();
            if (children != null) {
                for (File child : children) {
                    if (!child.isFile()) continue;
                    files.put(file(child.getName(), child.lastModified()));
                }
            }
            return files;
        }
        JSONObject entries = entries();
        Iterator<String> names = entries.keys();
        List<String> gone = new ArrayList<>();
        while (names.hasNext()) {
            String name = names.next();
            Uri uri = Uri.parse(entries.getString(name));
            try (
                Cursor cursor = context
                    .getContentResolver()
                    .query(uri, new String[] { MediaStore.MediaColumns.DATE_MODIFIED }, null, null, null)
            ) {
                if (cursor == null || !cursor.moveToFirst()) {
                    gone.add(name);
                    continue;
                }
                // DATE_MODIFIED is in seconds.
                files.put(file(name, cursor.isNull(0) ? 0 : cursor.getLong(0) * 1000));
            } catch (Exception e) {
                gone.add(name);
            }
        }
        for (String name : gone) forget(name);
        return files;
    }

    void remove(String name) throws Exception {
        if (!usesMediaStore()) {
            File file = legacyFile(name);
            if (file.exists() && !file.delete()) throw new IllegalStateException("The old copy couldn't be removed");
            return;
        }
        Uri file = entry(name);
        if (file == null) return;
        context.getContentResolver().delete(file, null, null);
        forget(name);
    }

    private InputStream open(String name) throws Exception {
        if (!usesMediaStore()) return new FileInputStream(legacyFile(name));
        Uri file = entry(name);
        if (file == null) throw new IllegalStateException("No such file in the backup folder");
        InputStream in = context.getContentResolver().openInputStream(file);
        if (in == null) throw new IllegalStateException("The file couldn't be opened");
        return in;
    }

    private JSObject file(String name, long modified) {
        JSObject file = new JSObject();
        file.put("name", name);
        file.put("modified", modified);
        return file;
    }

    private File legacyDir() {
        File documents = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        return documents == null ? null : new File(documents, "RepBunny");
    }

    private File legacyFile(String name) {
        File dir = legacyDir();
        if (dir == null) throw new IllegalStateException("Phone storage isn't available");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("The folder couldn't be made");
        return new File(dir, name);
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private JSONObject entries() {
        try {
            return new JSONObject(prefs().getString(ENTRIES, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private Uri entry(String name) {
        String uri = entries().optString(name, "");
        return uri.isEmpty() ? null : Uri.parse(uri);
    }

    private void remember(String name, Uri uri) throws Exception {
        JSONObject entries = entries();
        entries.put(name, uri.toString());
        prefs().edit().putString(ENTRIES, entries.toString()).apply();
    }

    private void forget(String name) {
        JSONObject entries = entries();
        entries.remove(name);
        prefs().edit().putString(ENTRIES, entries.toString()).apply();
    }
}
