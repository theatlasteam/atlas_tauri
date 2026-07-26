package get.ahmed.atlas.native

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import get.ahmed.atlas.R

class MessageAdapter(private val myUserId: String) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
    private var messages: List<NativeMessage> = emptyList()

    private val TYPE_MINE = 0
    private val TYPE_THEIRS = 1

    fun submit(newMessages: List<NativeMessage>) {
        messages = newMessages
        notifyDataSetChanged()
    }

    class BubbleHolder(view: View) : RecyclerView.ViewHolder(view) {
        val text: TextView = view.findViewById(R.id.messageText)
    }

    override fun getItemViewType(position: Int) =
        if (messages[position].authorId == myUserId) TYPE_MINE else TYPE_THEIRS

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val layout = if (viewType == TYPE_MINE) R.layout.item_native_message_mine else R.layout.item_native_message_theirs
        val view = LayoutInflater.from(parent.context).inflate(layout, parent, false)
        return BubbleHolder(view)
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        (holder as BubbleHolder).text.text = messages[position].text
    }

    override fun getItemCount() = messages.size
}
