package app.repbunny;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

// Issue #432: the web layer's handle on the folder the automatic copy goes to
// (src/lib/backupFolder.ts), the same contract as BackupFolderPlugin.swift.
// The person picks a folder with the Storage Access Framework
// (ACTION_OPEN_DOCUMENT_TREE); the tree URI and its persisted read/write
// grant survive restarts. Files are found by display name, since
// createDocument adds " (1)" rather than replacing. Registered in
// MainActivity.
// Issue #874: with no folder picked, every call uses the default folder the
// app picks (BackupDefaultFolder: Documents/RepBunny), so the copy is on with
// no question. The picker opens at that folder, which is how a new install
// finds the copies an old one left there.
@CapacitorPlugin(name = "BackupFolder")
public class BackupFolderPlugin extends Plugin {
    private static final String PREFS = "backup_folder";
    private static final String TREE = "tree";
    private static final String LOCAL_AUTHORITY = "com.android.externalstorage.documents";

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.putExtra(
                DocumentsContract.EXTRA_INITIAL_URI,
                DocumentsContract.buildDocumentUri(LOCAL_AUTHORITY, "primary:" + BackupDefaultFolder.RELATIVE_PATH)
            );
        }
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Folder pick cancelled");
            return;
        }
        Uri tree = data.getData();
        ContentResolver resolver = getContext().getContentResolver();
        try {
            resolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("That folder can't be kept", e);
            return;
        }
        Uri previous = savedTree();
        if (previous != null && !previous.equals(tree)) release(previous);
        prefs().edit().putString(TREE, tree.toString()).apply();
        call.resolve(info(tree));
    }

    // Forgets a picked folder; every call then uses the default one.
    @PluginMethod
    public void useDefault(PluginCall call) {
        Uri tree = savedTree();
        if (tree != null) release(tree);
        prefs().edit().remove(TREE).apply();
        call.resolve(defaults().info());
    }

    @PluginMethod
    public void status(PluginCall call) {
        Uri tree = savedTree();
        JSObject result = new JSObject();
        if (tree == null) {
            result = defaults().info();
            result.put("reachable", defaults().reachable());
        } else if (!reachable(tree)) {
            result.put("reachable", false);
        } else {
            result = info(tree);
            result.put("reachable", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String name = call.getString("name");
        String text = call.getString("text");
        Uri tree = savedTree();
        if (name == null || text == null) {
            call.reject("No file name or contents");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        try {
            if (tree == null) {
                defaults().write(name, text);
                call.resolve();
                return;
            }
            Uri file = find(tree, name);
            if (file == null) {
                file = DocumentsContract.createDocument(resolver, folderDocument(tree), "application/json", name);
                if (file == null) throw new IllegalStateException("The folder refused a new file");
            }
            // "wt" truncates, so a shorter copy doesn't leave the old tail behind.
            try (OutputStream out = resolver.openOutputStream(file, "wt")) {
                if (out == null) throw new IllegalStateException("The file couldn't be opened");
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't save to the backup folder", e);
        }
    }

    // Issue #871: reads a file already in the folder, so a copy there can be
    // kept under another name before the first save replaces it.
    @PluginMethod
    public void read(PluginCall call) {
        String name = call.getString("name");
        Uri tree = savedTree();
        if (name == null) {
            call.reject("No file name");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        try {
            if (tree == null) {
                JSObject result = new JSObject();
                result.put("text", defaults().read(name));
                call.resolve(result);
                return;
            }
            Uri file = find(tree, name);
            if (file == null) throw new IllegalStateException("No such file in the backup folder");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream in = resolver.openInputStream(file)) {
                if (in == null) throw new IllegalStateException("The file couldn't be opened");
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) != -1) bytes.write(buffer, 0, read);
            }
            JSObject result = new JSObject();
            result.put("text", new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Couldn't read the backup folder", e);
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        Uri tree = savedTree();
        if (tree == null) {
            try {
                JSObject result = new JSObject();
                result.put("files", defaults().list());
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Couldn't read the backup folder", e);
            }
            return;
        }
        JSArray files = new JSArray();
        try (Cursor cursor = children(tree)) {
            while (cursor != null && cursor.moveToNext()) {
                JSObject file = new JSObject();
                file.put("name", cursor.getString(1));
                file.put("modified", cursor.isNull(2) ? 0 : cursor.getLong(2));
                files.put(file);
            }
        } catch (Exception e) {
            call.reject("Couldn't read the backup folder", e);
            return;
        }
        JSObject result = new JSObject();
        result.put("files", files);
        call.resolve(result);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = call.getString("name");
        Uri tree = savedTree();
        if (name == null) {
            call.reject("No file name");
            return;
        }
        try {
            if (tree == null) {
                defaults().remove(name);
                call.resolve();
                return;
            }
            Uri file = find(tree, name);
            if (file != null) DocumentsContract.deleteDocument(getContext().getContentResolver(), file);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't remove the old copy", e);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Uri tree = savedTree();
        if (tree != null) release(tree);
        prefs().edit().remove(TREE).apply();
        call.resolve();
    }

    private BackupDefaultFolder defaults() {
        return new BackupDefaultFolder(getContext());
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private Uri savedTree() {
        String saved = prefs().getString(TREE, null);
        return saved == null ? null : Uri.parse(saved);
    }

    private void release(Uri tree) {
        try {
            getContext()
                .getContentResolver()
                .releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // Already gone.
        }
    }

    private boolean reachable(Uri tree) {
        boolean granted = false;
        for (UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(tree) && permission.isWritePermission()) granted = true;
        }
        if (!granted) return false;
        try (Cursor cursor = children(tree)) {
            return cursor != null;
        } catch (Exception e) {
            return false;
        }
    }

    private Uri folderDocument(Uri tree) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    // Columns: document id, display name, last modified.
    private Cursor children(Uri tree) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        return getContext()
            .getContentResolver()
            .query(
                children,
                new String[] {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED,
                },
                null,
                null,
                null
            );
    }

    private Uri find(Uri tree, String name) {
        try (Cursor cursor = children(tree)) {
            while (cursor != null && cursor.moveToNext()) {
                if (name.equals(cursor.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
            }
        }
        return null;
    }

    private JSObject info(Uri tree) {
        JSObject result = new JSObject();
        String name = null;
        try (
            Cursor cursor = getContext()
                .getContentResolver()
                .query(folderDocument(tree), new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)
        ) {
            if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
        } catch (Exception ignored) {
            // Fall back to the id below.
        }
        if (name == null) {
            String id = DocumentsContract.getTreeDocumentId(tree);
            name = id.substring(id.lastIndexOf(':') + 1);
        }
        result.put("name", name);
        result.put("local", LOCAL_AUTHORITY.equals(tree.getAuthority()));
        return result;
    }
}
