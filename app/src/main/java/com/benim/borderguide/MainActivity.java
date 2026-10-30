package com.benim.borderguide;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends ComponentActivity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/index.html";

    private FrameLayout root;
    private WebView web;
    private WebView printView;
    private ProBilling billing;

    // Android 13+ bildirim izni; sonuç web tarafına window.bgNotifPerm(true/false) ile döner.
    private final ActivityResultLauncher<String> notifPermission =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(),
                    granted -> callJs("window.bgNotifPerm && window.bgNotifPerm(" + (granted ? "true" : "false") + ")"));

    private void callJs(final String js) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Sistem çubukları ve klavye için boşluk bırak (Android 15+ kenardan kenara ekran).
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        boolean systemDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        applyTheme(systemDark ? "dark" : "light");

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        web.setBackgroundColor(Color.parseColor("#020617"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        billing = new ProBilling(this, event -> callJs("window.bgProEvent && window.bgProEvent('" + event + "')"));

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(START_URL);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("(window.bgBack && window.bgBack()) ? 'y' : 'n'", value -> {
                    if (value == null || !value.contains("y")) {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });
    }

    private void applyTheme(String theme) {
        boolean light = "light".equals(theme);
        int barColor = light ? Color.WHITE : ("amoled".equals(theme) ? Color.BLACK : Color.parseColor("#0F172A"));
        root.setBackgroundColor(barColor);
        getWindow().getDecorView().setBackgroundColor(barColor);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(light);
        c.setAppearanceLightNavigationBars(light);
    }

    private class Bridge {
        @JavascriptInterface
        public void setTheme(final String theme) {
            runOnUiThread(() -> applyTheme(theme));
        }

        @JavascriptInterface
        public boolean isPro() {
            return billing != null && billing.isPro();
        }

        @JavascriptInterface
        public String proPrice() {
            return billing == null ? "" : billing.price();
        }

        @JavascriptInterface
        public void buyPro() {
            runOnUiThread(() -> { if (billing != null) billing.buy(); });
        }

        @JavascriptInterface
        public void restorePro() {
            runOnUiThread(() -> { if (billing != null) billing.queryPurchases(true); });
        }

        @JavascriptInterface
        public void scheduleReminders(String json) {
            Reminders.save(getApplicationContext(), json);
        }

        @JavascriptInterface
        public void requestNotifPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < 33
                        || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                    callJs("window.bgNotifPerm && window.bgNotifPerm(true)");
                } else {
                    notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS);
                }
            });
        }

        // Raporu yazdırma ekranında açar; kullanıcı "PDF olarak kaydet"i seçebilir.
        @JavascriptInterface
        public void printReport(final String html, final String title) {
            if (html == null) return;
            runOnUiThread(() -> {
                final WebView pv = new WebView(MainActivity.this);
                printView = pv;
                pv.setWebViewClient(new WebViewClient() {
                    private boolean done = false;

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (done) return;
                        done = true;
                        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                        String job = (title == null || title.isEmpty()) ? "BorderGuide" : title;
                        if (pm != null) {
                            pm.print(job, view.createPrintDocumentAdapter(job),
                                    new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                        }
                    }
                });
                pv.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            });
        }

        @JavascriptInterface
        public boolean flightsEnabled() {
            return !BuildConfig.TP_TOKEN.isEmpty();
        }

        @JavascriptInterface
        public String tpMarker() {
            return BuildConfig.TP_MARKER;
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            if (url == null || !url.startsWith("https://")) return;
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) { }
            });
        }

        // Uçuş fiyatı isteği arka planda yapılır; sonuç window.bgFlightCb(id, json) ile web tarafına döner.
        @JavascriptInterface
        public void flightPrices(final String query, final String cbId) {
            if (query == null || cbId == null || BuildConfig.TP_TOKEN.isEmpty()) return;
            if (!query.matches("[A-Za-z0-9=&_.%-]{1,600}") || !cbId.matches("[a-z0-9]{1,20}")) return;
            new Thread(() -> {
                String body;
                HttpURLConnection c = null;
                try {
                    URL u = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates?" + query);
                    c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(15000);
                    c.setRequestProperty("X-Access-Token", BuildConfig.TP_TOKEN);
                    c.setRequestProperty("Accept", "application/json");
                    int code = c.getResponseCode();
                    body = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
                    if (code >= 400 || body.isEmpty()) body = "{\"success\":false,\"error\":\"HTTP " + code + "\"}";
                } catch (Exception e) {
                    body = "{\"success\":false,\"error\":\"network\"}";
                } finally {
                    if (c != null) c.disconnect();
                }
                final String js = "window.bgFlightCb && window.bgFlightCb(" + JSONObject.quote(cbId) + "," + JSONObject.quote(body) + ")";
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript(js, null);
                });
            }).start();
        }

        @JavascriptInterface
        public boolean isSystemDark() {
            return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        }

        @JavascriptInterface
        public String getVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }

    private static String readAll(InputStream in) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (web != null) web.evaluateJavascript("window.bgSystemThemeChanged && window.bgSystemThemeChanged()", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (billing != null) billing.end();
        if (web != null) {
            root.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
