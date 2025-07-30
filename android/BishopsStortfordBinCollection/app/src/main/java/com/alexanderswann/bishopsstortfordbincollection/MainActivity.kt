package com.alexanderswann.bishopsstortfordbincollection

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.alexanderswann.bishopsstortfordbincollection.ui.theme.BishopsStortfordBinCollectionTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BishopsStortfordBinCollectionTheme {
                // Just pass the initial homepage URL here
                AppWithBanner(initialUrl = "https://bsbins.vercel.app")
            }
        }
    }
}

@Composable
fun AppWithBanner(initialUrl: String) {
    var currentUrl by remember { mutableStateOf(initialUrl) }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }

    // Define what happens when Home banner is clicked:
    val onHomeClicked = {
        webViewInstance?.loadUrl(initialUrl)
        currentUrl = initialUrl
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Banner(onHomeClicked = onHomeClicked)

        Spacer(modifier = Modifier.height(1.dp)) // subtle line (or use Divider if using material)

        WebViewScreen(
            url = currentUrl,
            modifier = Modifier.weight(1f),
            onWebViewCreated = { webViewInstance = it }
        )
    }
}


@Composable
fun Banner(onHomeClicked: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(66.dp)
            .background(Color(0xCCCCCCCC))
            .clickable { onHomeClicked() },
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Filled.Home,
                contentDescription = "Home Icon",
                tint = Color.DarkGray,
                modifier = Modifier
                    .size(24.dp)
                    .align(Alignment.CenterVertically)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Home",
                fontSize = 20.sp,
                color = Color.DarkGray,
                modifier = Modifier.align(Alignment.CenterVertically)
            )
        }
    }
}

@Composable
fun WebViewScreen(url: String, modifier: Modifier = Modifier, onWebViewCreated: (WebView) -> Unit) {
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                webViewClient = WebViewClient()
                settings.javaScriptEnabled = true
                onWebViewCreated(this)
                loadUrl(url)
            }
        },
        update = { webView ->
            webView.loadUrl(url)
        },
        modifier = modifier
    )
}
