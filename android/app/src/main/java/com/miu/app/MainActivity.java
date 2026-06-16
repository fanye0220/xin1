package com.miu.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends BridgeActivity {

    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> filePickerLauncher;
    private ActivityResultLauncher<Intent> zipPickerLauncher;

    // Native unzip state (polled from JS)
    private volatile String unzipStatus = "IDLE";
    private volatile int unzipCurrent = 0;
    private volatile int unzipTotal = 0;
    private volatile String unzipMessage = "";

    private File getSaveDirectory() {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "MIU");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        filePickerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (filePathCallback == null) return;
                Uri[] results = null;
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    Intent data = result.getData();
                    if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    } else if (data.getData() != null) {
                        results = new Uri[]{ data.getData() };
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        );

        zipPickerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    Uri zipUri = result.getData().getData();
                    if (zipUri != null) startNativeUnzip(zipUri);
                }
            }
        );

        requestStoragePermissions();

        WebView webView = this.bridge.getWebView();
        webView.addJavascriptInterface(new WebAppInterface(), "Android");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePath,
                                              FileChooserParams fileChooserParams) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = filePath;
                Intent intent = fileChooserParams.createIntent();
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    filePickerLauncher.launch(intent);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private void startNativeUnzip(Uri zipUri) {
        unzipStatus = "EXTRACTING";
        unzipCurrent = 0; unzipTotal = 0; unzipMessage = "正在准备...";
        new Thread(() -> {
            try {
                File outDir = getSaveDirectory();
                // Count entries first
                InputStream is1 = getContentResolver().openInputStream(zipUri);
                if (is1 == null) { unzipStatus = "ERROR:无法读取ZIP文件"; return; }
                ZipInputStream counter = new ZipInputStream(is1);
                int total = 0; ZipEntry ce;
                while ((ce = counter.getNextEntry()) != null) { if (!ce.isDirectory()) total++; counter.closeEntry(); }
                counter.close();
                unzipTotal = total;

                InputStream is2 = getContentResolver().openInputStream(zipUri);
                if (is2 == null) { unzipStatus = "ERROR:无法重新读取ZIP文件"; return; }
                ZipInputStream zis = new ZipInputStream(is2);
                ZipEntry entry; int done = 0;
                while ((entry = zis.getNextEntry()) != null) {
                    if (!entry.isDirectory()) {
                        unzipMessage = entry.getName();
                        File outFile = new File(outDir, entry.getName());
                        if (outFile.getParentFile() != null) outFile.getParentFile().mkdirs();
                        FileOutputStream fos = new FileOutputStream(outFile);
                        byte[] buf = new byte[16384]; int len;
                        while ((len = zis.read(buf)) > 0) fos.write(buf, 0, len);
                        fos.close(); done++; unzipCurrent = done;
                    }
                    zis.closeEntry();
                }
                zis.close();
                unzipStatus = "SUCCESS:" + done + " files extracted";
            } catch (Exception e) { unzipStatus = "ERROR:" + e.getMessage(); }
        }).start();
    }

    private void startNativeUnzipFromPath(String filename) {
        File zipFile = new File(getSaveDirectory(), filename);
        if (!zipFile.exists()) { unzipStatus = "ERROR:文件不存在: " + filename; return; }
        unzipStatus = "EXTRACTING";
        unzipCurrent = 0; unzipTotal = 0; unzipMessage = "正在准备...";
        new Thread(() -> {
            try {
                File outDir = getSaveDirectory();
                ZipInputStream counter = new ZipInputStream(new FileInputStream(zipFile));
                int total = 0; ZipEntry ce;
                while ((ce = counter.getNextEntry()) != null) { if (!ce.isDirectory()) total++; counter.closeEntry(); }
                counter.close(); unzipTotal = total;

                ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile));
                ZipEntry entry; int done = 0;
                while ((entry = zis.getNextEntry()) != null) {
                    if (!entry.isDirectory()) {
                        unzipMessage = entry.getName();
                        File outFile = new File(outDir, entry.getName());
                        if (outFile.getParentFile() != null) outFile.getParentFile().mkdirs();
                        FileOutputStream fos = new FileOutputStream(outFile);
                        byte[] buf = new byte[16384]; int len;
                        while ((len = zis.read(buf)) > 0) fos.write(buf, 0, len);
                        fos.close(); done++; unzipCurrent = done;
                    }
                    zis.closeEntry();
                }
                zis.close();
                unzipStatus = "SUCCESS:" + done + " files extracted";
            } catch (Exception e) { unzipStatus = "ERROR:" + e.getMessage(); }
        }).start();
    }

    private void requestStoragePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            List<String> permsNeeded = new ArrayList<>();
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES)
                    != PackageManager.PERMISSION_GRANTED)
                permsNeeded.add(Manifest.permission.READ_MEDIA_IMAGES);
            if (!permsNeeded.isEmpty())
                ActivityCompat.requestPermissions(this, permsNeeded.toArray(new String[0]), 1);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            List<String> permsNeeded = new ArrayList<>();
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED)
                permsNeeded.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED)
                permsNeeded.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            if (!permsNeeded.isEmpty())
                ActivityCompat.requestPermissions(this, permsNeeded.toArray(new String[0]), 1);
        }
    }

    private class WebAppInterface {

        private java.util.concurrent.ConcurrentHashMap<String, java.util.zip.ZipOutputStream> openZips =
            new java.util.concurrent.ConcurrentHashMap<>();

        // ── 原有方法（v3全部保留）──────────────────────────────────────────

        @JavascriptInterface
        public boolean startZip(String filename) {
            try {
                File file = new File(getSaveDirectory(), filename);
                if (file.getParentFile() != null && !file.getParentFile().exists()) file.getParentFile().mkdirs();
                openZips.put(filename, new java.util.zip.ZipOutputStream(new FileOutputStream(file)));
                return true;
            } catch (Exception e) { e.printStackTrace(); return false; }
        }

        @JavascriptInterface
        public boolean addZipEntry(String zipFilename, String entryName, String base64Data) {
            try {
                java.util.zip.ZipOutputStream zos = openZips.get(zipFilename);
                if (zos == null) return false;
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                zos.putNextEntry(new java.util.zip.ZipEntry(entryName));
                zos.write(bytes); zos.closeEntry();
                return true;
            } catch (Exception e) { e.printStackTrace(); return false; }
        }

        @JavascriptInterface
        public boolean addLocalFileToZip(String zipFilename, String entryName, String localFilePath) {
            try {
                java.util.zip.ZipOutputStream zos = openZips.get(zipFilename);
                if (zos == null) return false;
                File srcFile = new File(localFilePath);
                if (!srcFile.exists()) return false;
                zos.putNextEntry(new java.util.zip.ZipEntry(entryName));
                FileInputStream in = new FileInputStream(srcFile);
                byte[] buffer = new byte[8192]; int len;
                while ((len = in.read(buffer)) > 0) zos.write(buffer, 0, len);
                in.close(); zos.closeEntry();
                return true;
            } catch (Exception e) { e.printStackTrace(); return false; }
        }

        @JavascriptInterface
        public String finishZip(String zipFilename) {
            try {
                java.util.zip.ZipOutputStream zos = openZips.remove(zipFilename);
                if (zos == null) return null;
                zos.close();
                return new File(getSaveDirectory(), zipFilename).getAbsolutePath();
            } catch (Exception e) { e.printStackTrace(); return null; }
        }

        @JavascriptInterface
        public String saveTavernFile(String filename, String base64Data) {
            try {
                File file = new File(getSaveDirectory(), filename);
                if (file.getParentFile() != null && !file.getParentFile().exists()) file.getParentFile().mkdirs();
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(bytes); fos.close();
                return file.getAbsolutePath();
            } catch (Exception e) { e.printStackTrace(); return null; }
        }

        @JavascriptInterface
        public String readTavernFile(String path) {
            try {
                File file = new File(path);
                if (file.exists()) {
                    FileInputStream stream = new FileInputStream(file);
                    byte[] bytes = new byte[(int) file.length()];
                    stream.read(bytes); stream.close();
                    return Base64.encodeToString(bytes, Base64.NO_WRAP);
                }
            } catch (Exception e) { e.printStackTrace(); }
            return null;
        }

        @JavascriptInterface
        public boolean deleteFile(String path) {
            try {
                File f = new File(path);
                if (f.isDirectory()) return deleteRecursive(f);
                return f.delete();
            } catch (Exception e) { return false; }
        }

        private boolean deleteRecursive(File f) {
            if (f.isDirectory()) {
                File[] children = f.listFiles();
                if (children != null) for (File child : children) deleteRecursive(child);
            }
            return f.delete();
        }

        @JavascriptInterface
        public boolean renameFile(String oldPath, String newRelativePath) {
            try {
                File oldFile = new File(oldPath);
                if (!oldFile.isAbsolute()) oldFile = new File(getSaveDirectory(), oldPath);
                if (!oldFile.exists()) return false;
                File newFile = new File(getSaveDirectory(), newRelativePath);
                if (newFile.getParentFile() != null && !newFile.getParentFile().exists()) newFile.getParentFile().mkdirs();
                return oldFile.renameTo(newFile);
            } catch (Exception e) { return false; }
        }

        private java.util.concurrent.ConcurrentHashMap<String, FileOutputStream> openTempFiles =
            new java.util.concurrent.ConcurrentHashMap<>();

        @JavascriptInterface
        public boolean startTempFile(String filename) {
            try {
                File f = new File(getSaveDirectory(), filename);
                if (f.getParentFile() != null) f.getParentFile().mkdirs();
                openTempFiles.put(filename, new FileOutputStream(f, false));
                return true;
            } catch (Exception e) { e.printStackTrace(); return false; }
        }

        @JavascriptInterface
        public boolean appendTempFile(String filename, String base64Chunk) {
            try {
                FileOutputStream fos = openTempFiles.get(filename);
                if (fos == null) return false;
                byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
                fos.write(bytes);
                return true;
            } catch (Exception e) { e.printStackTrace(); return false; }
        }

        @JavascriptInterface
        public String unzipTempFile(String filename, String targetFolderName) {
            try {
                FileOutputStream fos = openTempFiles.remove(filename);
                if (fos != null) fos.close();
                File zipFile = new File(getSaveDirectory(), filename);
                File outDir = new File(getSaveDirectory(), targetFolderName);
                outDir.mkdirs();
                JSONArray result = new JSONArray();
                ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile));
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    if (!entry.isDirectory()) {
                        File outFile = new File(outDir, entry.getName());
                        if (outFile.getParentFile() != null) outFile.getParentFile().mkdirs();
                        FileOutputStream out = new FileOutputStream(outFile);
                        byte[] buf = new byte[16384]; int len;
                        while ((len = zis.read(buf)) > 0) out.write(buf, 0, len);
                        out.close();
                        result.put(outFile.getAbsolutePath());
                    }
                    zis.closeEntry();
                }
                zis.close();
                zipFile.delete();
                return result.toString();
            } catch (Exception e) { e.printStackTrace(); return "[]"; }
        }

        @JavascriptInterface
        public String pickFiles() { return "[]"; }

        // ── 新增方法（你的新功能）──────────────────────────────────────────

        @JavascriptInterface
        public boolean fileExists(String path) {
            try {
                File f = new File(path);
                if (!f.isAbsolute()) f = new File(getSaveDirectory(), path);
                return f.exists();
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String scanMiuDirectory() {
            try {
                File dir = getSaveDirectory();
                JSONArray result = new JSONArray();
                scanDirRecursive(dir, dir, result);
                return result.toString();
            } catch (Exception e) { e.printStackTrace(); return "[]"; }
        }

        private void scanDirRecursive(File base, File current, JSONArray result) {
            File[] files = current.listFiles();
            if (files == null) return;
            for (File f : files) {
                if (f.isDirectory()) {
                    scanDirRecursive(base, f, result);
                } else {
                    String name = f.getName().toLowerCase();
                    if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")
                            || name.endsWith(".webp") || name.endsWith(".gif")
                            || name.endsWith(".json") || name.endsWith(".jsonl")) {
                        try {
                            String rel = base.toURI().relativize(f.toURI()).getPath();
                            JSONObject obj = new JSONObject();
                            obj.put("absolutePath", f.getAbsolutePath());
                            obj.put("relativePath", rel);
                            obj.put("name", f.getName());
                            obj.put("size", f.length());
                            result.put(obj);
                        } catch (Exception ignored) {}
                    }
                }
            }
        }

        @JavascriptInterface
        public void pickAndUnzipZip() {
            try {
                unzipStatus = "IDLE";
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("application/zip");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                zipPickerLauncher.launch(Intent.createChooser(intent, "选择ZIP备份包"));
            } catch (Exception e) { unzipStatus = "ERROR:" + e.getMessage(); }
        }

        @JavascriptInterface
        public boolean unzipLocalZip(String filename) {
            try {
                unzipStatus = "IDLE";
                startNativeUnzipFromPath(filename);
                return true;
            } catch (Exception e) { unzipStatus = "ERROR:" + e.getMessage(); return false; }
        }

        @JavascriptInterface
        public String getUnzipStatus() {
            try {
                JSONObject obj = new JSONObject();
                obj.put("status", unzipStatus);
                obj.put("current", unzipCurrent);
                obj.put("total", unzipTotal);
                obj.put("message", unzipMessage);
                return obj.toString();
            } catch (Exception e) {
                return "{\"status\":\"IDLE\",\"current\":0,\"total\":0,\"message\":\"\"}";
            }
        }

        @JavascriptInterface
        public void resetUnzipStatus() {
            unzipStatus = "IDLE"; unzipCurrent = 0; unzipTotal = 0; unzipMessage = "";
        }

        @JavascriptInterface
        public String scanZipsOnAndroid() {
            try {
                File dir = getSaveDirectory();
                JSONArray result = new JSONArray();
                File[] files = dir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        if (f.isFile() && f.getName().toLowerCase().endsWith(".zip")) {
                            JSONObject obj = new JSONObject();
                            obj.put("name", f.getName());
                            obj.put("size", f.length());
                            obj.put("absolutePath", f.getAbsolutePath());
                            result.put(obj);
                        }
                    }
                }
                return result.toString();
            } catch (Exception e) { return "[]"; }
        }
    }
}
