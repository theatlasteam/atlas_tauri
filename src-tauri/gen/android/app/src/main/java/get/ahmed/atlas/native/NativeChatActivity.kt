package get.ahmed.atlas.native

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import get.ahmed.atlas.R

/** "Native Experimental" prototype's chat screen. Plaintext-only, no
 * WebSocket — polls once on load/send; see NativeChatListActivity's banner. */
class NativeChatActivity : AppCompatActivity() {
    private lateinit var api: ApiClient
    private lateinit var chatId: String
    private lateinit var adapter: MessageAdapter
    private lateinit var recyclerView: RecyclerView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_native_chat)

        val serverUrl = intent.getStringExtra("serverUrl") ?: ""
        val token = intent.getStringExtra("token") ?: ""
        chatId = intent.getStringExtra("chatId") ?: ""
        val chatName = intent.getStringExtra("chatName") ?: "Chat"
        if (serverUrl.isEmpty() || token.isEmpty() || chatId.isEmpty()) {
            finish()
            return
        }
        api = ApiClient(serverUrl, token)

        val toolbar = findViewById<com.google.android.material.appbar.MaterialToolbar>(R.id.toolbar)
        toolbar.title = chatName
        toolbar.setNavigationOnClickListener { finish() }

        val errorState = findViewById<TextView>(R.id.errorState)
        val draftInput = findViewById<EditText>(R.id.draftInput)
        val sendButton = findViewById<Button>(R.id.sendButton)
        recyclerView = findViewById(R.id.recyclerView)
        recyclerView.layoutManager = LinearLayoutManager(this)

        // Resolve "my" user id first (needed to tell mine/theirs bubbles apart),
        // then load the message list.
        api.me { result ->
            result.onSuccess { me ->
                val myId = me?.optString("id") ?: ""
                adapter = MessageAdapter(myId)
                recyclerView.adapter = adapter
                loadMessages(errorState)
            }.onFailure { e ->
                errorState.text = "Couldn't load your profile: ${e.message}"
                errorState.visibility = View.VISIBLE
            }
        }

        sendButton.setOnClickListener {
            val text = draftInput.text.toString().trim()
            if (text.isEmpty()) return@setOnClickListener
            sendButton.isEnabled = false
            api.sendMessage(chatId, text) { result ->
                sendButton.isEnabled = true
                result.onSuccess {
                    draftInput.setText("")
                    loadMessages(errorState)
                }.onFailure { e ->
                    Toast.makeText(this, "Send failed: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun loadMessages(errorState: TextView) {
        if (!::adapter.isInitialized) return
        api.listMessages(chatId) { result ->
            result.onSuccess { messages ->
                errorState.visibility = View.GONE
                adapter.submit(messages)
                if (messages.isNotEmpty()) recyclerView.scrollToPosition(messages.size - 1)
            }.onFailure { e ->
                errorState.text = "Couldn't load messages: ${e.message}"
                errorState.visibility = View.VISIBLE
            }
        }
    }
}
