package get.ahmed.atlas.native

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import get.ahmed.atlas.MainActivity
import get.ahmed.atlas.R

/**
 * "Native Experimental" prototype's main page — reached via the
 * atlas-native://open?serverUrl=...&token=... deep link fired from the
 * webview's Dev settings toggle (src/screens/settings/Dev.tsx). Talks to
 * the same REST API directly; no WebSocket, no E2EE (see the in-app banner).
 */
class NativeChatListActivity : AppCompatActivity() {
    private lateinit var api: ApiClient
    private lateinit var serverUrl: String
    private lateinit var token: String
    private lateinit var adapter: ChatAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_native_chat_list)

        val uri = intent?.data
        serverUrl = uri?.getQueryParameter("serverUrl") ?: ""
        token = uri?.getQueryParameter("token") ?: ""
        if (serverUrl.isEmpty() || token.isEmpty()) {
            Toast.makeText(this, "Missing server URL/token — open this from the app's Dev settings.", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        api = ApiClient(serverUrl, token)

        val toolbar = findViewById<com.google.android.material.appbar.MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationIcon(R.drawable.ic_back)
        toolbar.setNavigationOnClickListener {
            // Back to the real (WebView) app, not just finish() — there may be
            // nothing else on the native back stack since this was opened via
            // a deep link, not a normal launcher tap.
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }

        val recyclerView = findViewById<RecyclerView>(R.id.recyclerView)
        val swipeRefresh = findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        val emptyState = findViewById<TextView>(R.id.emptyState)
        val errorState = findViewById<TextView>(R.id.errorState)

        adapter = ChatAdapter { chat ->
            val intent = Intent(this, NativeChatActivity::class.java).apply {
                putExtra("serverUrl", serverUrl)
                putExtra("token", token)
                putExtra("chatId", chat.id)
                putExtra("chatName", chat.name)
            }
            startActivity(intent)
        }
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = adapter

        fun load() {
            swipeRefresh.isRefreshing = true
            errorState.visibility = View.GONE
            api.listChats { result ->
                swipeRefresh.isRefreshing = false
                result.onSuccess { chats ->
                    adapter.submit(chats)
                    emptyState.visibility = if (chats.isEmpty()) View.VISIBLE else View.GONE
                }.onFailure { e ->
                    errorState.text = "Couldn't load chats: ${e.message}"
                    errorState.visibility = View.VISIBLE
                }
            }
        }

        swipeRefresh.setOnRefreshListener { load() }
        load()
    }
}
