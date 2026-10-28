package com.fanreelz.app;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.OrientationEventListener;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * Fanreelz for Android: fanreelz.com in Android's own web view, so the app (not Chrome) controls full screen:
 * no "swipe from the top to exit full screen" notice, the phone's bars hide and the screen turns, like YouTube.
 * The page talks to the app through window.FanreelzApp (bars, orient).
 * Sign-in with Google/Discord opens in a Chrome tab (Google refuses sign-in inside web views); fanreelz.com/app-auth
 * then sends the result back here as fanreelz://auth?u=<page to open>, which this activity loads.
 */
public class MainActivity extends ComponentActivity {
    private static final String HOST = "fanreelz.com";
    private static final String START = "https://fanreelz.com/?source=android";
    private static final int BRAND = Color.parseColor("#110F17");

    private WebView web;
    private FrameLayout root;
    private boolean immersive = false;
    private View customView;                                  // YouTube's own full screen, if its controls are used
    private WebChromeClient.CustomViewCallback customCallback;
    private ValueCallback<Uri[]> fileCallback;
    private ActivityResultLauncher<Intent> filePicker;
    private WebChromeClient chrome;
    // full screen locked to landscape: once the phone really lies sideways, turning it back upright leaves full screen (like YouTube)
    private OrientationEventListener turn;
    private boolean lockedLandscape = false, seenSideways = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(BRAND);
        w.setNavigationBarColor(BRAND);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            w.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(BRAND);
        web = new WebView(this);
        web.setBackgroundColor(BRAND);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Android 15+ draws apps under the status and navigation bars: keep the page clear of them, except in full screen
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (immersive || customView != null) {
                v.setPadding(0, 0, 0, 0);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            // the app already keeps the page clear of the bars: don't pass them on, or the page adds the same space again
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return WindowInsets.CONSUMED;
            return insets.consumeSystemWindowInsets();
        });

        turn = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int deg) {
                if (!lockedLandscape || deg == ORIENTATION_UNKNOWN) return;
                if ((deg > 60 && deg < 120) || (deg > 240 && deg < 300)) seenSideways = true;
                else if (seenSideways && (deg < 25 || deg > 335)) {
                    lockedLandscape = false;
                    turn.disable();
                    runOnUiThread(() -> {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                        web.evaluateJavascript("window.fanreelzExitFull&&window.fanreelzExitFull()", null);
                    });
                }
            }
        };

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " FanreelzApp/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "FanreelzApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return openOutside(req.getUrl());
            }
        });

        filePicker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            if (fileCallback == null) return;
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.getResultCode(), r.getData()));
            fileCallback = null;
        });

        chrome = new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    filePicker.launch(params.createIntent());
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                setBars(false);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                if (customCallback != null) customCallback.onCustomViewHidden();
                customCallback = null;
                setBars(true);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            }
        };
        web.setWebChromeClient(chrome);

        // The phone's back button: leave full screen, then go back in the site, then close the app
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null) {
                    chrome.onHideCustomView();
                } else if (web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(urlFrom(getIntent()));
        }
    }

    /** fanreelz.com stays in the app; sign-in and other sites open in a Chrome tab; other apps (YouTube, Discord…) open themselves. */
    private boolean openOutside(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        String host = uri.getHost() == null ? "" : uri.getHost();
        if ((scheme.equals("https") || scheme.equals("http")) && (host.equals(HOST) || host.endsWith("." + HOST))) return false;
        try {
            if (scheme.equals("https") || scheme.equals("http")) {
                CustomTabsIntent tab = new CustomTabsIntent.Builder().setShowTitle(true).build();
                tab.launchUrl(this, uri);
            } else if (scheme.equals("intent")) {
                Intent i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                startActivity(i);
            } else {
                startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
            }
        } catch (Exception e) {
            // nothing can open it: stay on the page
        }
        return true;
    }

    /** The page to open: a fanreelz.com link, the result of a sign-in (fanreelz://auth?u=…), or the home page. */
    private String urlFrom(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null) return START;
        if ("fanreelz".equals(data.getScheme())) {
            String u = data.getQueryParameter("u");
            if (u != null && u.startsWith("https://" + HOST + "/")) return u;
            return START;
        }
        String host = data.getHost() == null ? "" : data.getHost();
        if ("https".equals(data.getScheme()) && (host.equals(HOST) || host.endsWith("." + HOST))) return data.toString();
        return START;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getData() != null) web.loadUrl(urlFrom(intent));
    }

    /** Show or hide the status and navigation bars (hidden in full screen; a swipe from the edge shows them for a moment). */
    private void setBars(boolean show) {
        immersive = !show;
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                if (show) {
                    c.show(WindowInsets.Type.systemBars());
                } else {
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    c.hide(WindowInsets.Type.systemBars());
                }
            }
        } else {
            int flags = show ? View.SYSTEM_UI_FLAG_VISIBLE
                    : View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
            w.getDecorView().setSystemUiVisibility(flags);
        }
        root.requestApplyInsets();
    }

    /** Called by the page (window.FanreelzApp). Only fanreelz.com pages get this bridge. */
    private class Bridge {
        @JavascriptInterface
        public void bars(boolean show) {
            runOnUiThread(() -> {
                if (!isOurPage()) return;
                setBars(show);
            });
        }

        @JavascriptInterface
        public void orient(String mode) {
            runOnUiThread(() -> {
                if (!isOurPage()) return;
                int o = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
                if ("landscape".equals(mode)) o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
                else if ("portrait".equals(mode)) o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
                lockedLandscape = "landscape".equals(mode);
                seenSideways = false;
                if (lockedLandscape && turn.canDetectOrientation()) turn.enable(); else turn.disable();
                setRequestedOrientation(o);
            });
        }
    }

    private boolean isOurPage() {
        String u = web.getUrl();
        if (u == null) return false;
        Uri uri = Uri.parse(u);
        String host = uri.getHost() == null ? "" : uri.getHost();
        return "https".equals(uri.getScheme()) && (host.equals(HOST) || host.endsWith("." + HOST));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (immersive) setBars(false);
    }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (turn != null) turn.disable();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
