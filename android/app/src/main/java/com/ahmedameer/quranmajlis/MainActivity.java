package com.ahmedameer.quranmajlis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** يعرض الموقع المضمَّن في التطبيق بملء الشاشة، دون أي اتصال بالإنترنت. */
public class MainActivity extends Activity {
    private static final long BACK_WINDOW_MS = 2500;

    private WebView web;
    private long lastBack;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // الشاشة تبقى مضاءة طوال القراءة في المجلس
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b1324"));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setTextZoom(100);
        web.setWebViewClient(new WebViewClient());
        setContentView(web);

        web.loadUrl("file:///android_asset/site/index.html");
        web.requestFocus();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onBackPressed() {
        // الصفحة تعالج الرجوع أولاً: إغلاق نافذة أو إلغاء تمييز
        web.evaluateJavascript("window.androidBack ? androidBack() : false", result -> {
            if ("true".equals(result)) {
                return;
            }
            long now = System.currentTimeMillis();
            if (now - lastBack < BACK_WINDOW_MS) {
                finish();
            } else {
                lastBack = now;
                Toast.makeText(this, R.string.press_back_again, Toast.LENGTH_SHORT).show();
            }
        });
    }
}
