package com.silicon.tavern;

import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

public class MainActivity extends BridgeActivity {

    private File getSaveDirectory() {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "MIU");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Request permissions for Android 6.0+
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{
                Manifest.permission.WRITE_EXTERNAL_STORAGE, 
                Manifest.permission.READ_EXTERNAL_STORAGE
            }, 1);
        }

        // Inject our custom JavascriptInterface
        WebView webView = this.bridge.getWebView();
        webView.addJavascriptInterface(new WebAppInterface(), "Android");
    }

    private class WebAppInterface {

        private java.util.concurrent.ConcurrentHashMap<String, java.util.zip.ZipOutputStream> openZips = new java.util.concurrent.ConcurrentHashMap<>();

        private java.util.concurrent.ConcurrentHashMap<String, FileOutputStream> openTempFiles = new java.util.concurrent.ConcurrentHashMap<>();

        @JavascriptInterface
        public boolean startTempFile(String filename) {
            try {
                File dir = new File(getSaveDirectory(), "Temp");
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(file);
                openTempFiles.put(filename, fos);
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public boolean appendTempFile(String filename, String base64Data) {
            try {
                FileOutputStream fos = openTempFiles.get(filename);
                if (fos == null) return false;
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                fos.write(bytes);
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public String unzipTempFile(String filename, String targetFolderName) {
            org.json.JSONArray filePaths = new org.json.JSONArray();
            try {
                FileOutputStream fos = openTempFiles.remove(filename);
                if (fos != null) fos.close();

                File dir = new File(getSaveDirectory(), "Temp");
                File sourceZip = new File(dir, filename);
                if (!sourceZip.exists()) return "[]";

                File targetDir = new File(getSaveDirectory(), targetFolderName);
                if (!targetDir.exists()) targetDir.mkdirs();

                java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new FileInputStream(sourceZip));
                java.util.zip.ZipEntry entry = zis.getNextEntry();
                while (entry != null) {
                    File newFile = new File(targetDir, entry.getName());
                    // Prevent path traversal
                    if (!newFile.getCanonicalPath().startsWith(targetDir.getCanonicalPath())) {
                        zis.closeEntry();
                        entry = zis.getNextEntry();
                        continue;
                    }

                    if (entry.isDirectory()) {
                        newFile.mkdirs();
                    } else {
                        if (newFile.getParentFile() != null) {
                            newFile.getParentFile().mkdirs();
                        }
                        FileOutputStream out = new FileOutputStream(newFile);
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            out.write(buffer, 0, len);
                        }
                        out.close();
                        filePaths.put(newFile.getAbsolutePath());
                    }
                    zis.closeEntry();
                    entry = zis.getNextEntry();
                }
                zis.close();
                sourceZip.delete(); // cleanup
            } catch (Exception e) {
                e.printStackTrace();
            }
            return filePaths.toString();
        }

        @JavascriptInterface
        public boolean startZip(String filename) {
            try {
                File dir = getSaveDirectory();
                File file = new File(dir, filename);
                if (file.getParentFile() != null && !file.getParentFile().exists()) {
                    file.getParentFile().mkdirs();
                }
                FileOutputStream fos = new FileOutputStream(file);
                java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(fos);
                openZips.put(filename, zos);
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public boolean addZipEntry(String zipFilename, String entryName, String base64Data) {
            try {
                java.util.zip.ZipOutputStream zos = openZips.get(zipFilename);
                if (zos == null) return false;
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                zos.putNextEntry(new java.util.zip.ZipEntry(entryName));
                zos.write(bytes);
                zos.closeEntry();
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
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
                byte[] buffer = new byte[8192];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    zos.write(buffer, 0, len);
                }
                in.close();
                zos.closeEntry();
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public String finishZip(String zipFilename) {
            try {
                java.util.zip.ZipOutputStream zos = openZips.remove(zipFilename);
                if (zos == null) return null;
                zos.close();
                File dir = getSaveDirectory();
                return new File(dir, zipFilename).getAbsolutePath();
            } catch (Exception e) {
                e.printStackTrace();
                return null;
            }
        }

        @JavascriptInterface
        public String saveTavernFile(String filename, String base64Data) {
            try {
                File dir = getSaveDirectory();
                File file = new File(dir, filename);
                
                // Ensure subdirectories exist if filename contains slashes
                if (file.getParentFile() != null && !file.getParentFile().exists()) {
                    file.getParentFile().mkdirs();
                }

                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(bytes);
                fos.close();
                return file.getAbsolutePath();
            } catch (Exception e) {
                e.printStackTrace();
                return null;
            }
        }

        @JavascriptInterface
        public String readTavernFile(String path) {
            try {
                File file = new File(path);
                if (file.exists()) {
                    FileInputStream stream = new FileInputStream(file);
                    byte[] bytes = new byte[(int) file.length()];
                    stream.read(bytes);
                    stream.close();
                    return Base64.encodeToString(bytes, Base64.NO_WRAP);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return null;
        }

        @JavascriptInterface
        public boolean deleteFile(String path) {
            try {
                File file = new File(path);
                if (!file.isAbsolute()) {
                    file = new File(getSaveDirectory(), path);
                }
                return deleteRecursive(file);
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean renameFile(String oldPath, String newPath) {
            try {
                File oldFile = new File(oldPath);
                if (!oldFile.isAbsolute()) {
                    oldFile = new File(getSaveDirectory(), oldPath);
                }
                File newFile = new File(newPath);
                if (!newFile.isAbsolute()) {
                    newFile = new File(getSaveDirectory(), newPath);
                }
                if (newFile.exists()) return false;
                if (newFile.getParentFile() != null) {
                    newFile.getParentFile().mkdirs();
                }
                return oldFile.renameTo(newFile);
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        private boolean deleteRecursive(File fileOrDirectory) {
            if (fileOrDirectory.isDirectory()) {
                File[] children = fileOrDirectory.listFiles();
                if (children != null) {
                    for (File child : children) {
                        deleteRecursive(child);
                    }
                }
            }
            return fileOrDirectory.delete();
        }

        @JavascriptInterface
        public String getSaveDirectoryInterface() {
            return getSaveDirectory().getAbsolutePath();
        }
    }
}

