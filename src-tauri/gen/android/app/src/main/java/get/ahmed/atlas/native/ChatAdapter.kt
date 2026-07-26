package get.ahmed.atlas.native

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import get.ahmed.atlas.R

class ChatAdapter(private val onClick: (NativeChat) -> Unit) :
    RecyclerView.Adapter<ChatAdapter.ViewHolder>() {

    private var chats: List<NativeChat> = emptyList()

    fun submit(newChats: List<NativeChat>) {
        chats = newChats
        notifyDataSetChanged()
    }

    class ViewHolder(view: android.view.View) : RecyclerView.ViewHolder(view) {
        val avatar: TextView = view.findViewById(R.id.avatar)
        val name: TextView = view.findViewById(R.id.name)
        val preview: TextView = view.findViewById(R.id.preview)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_native_chat, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val chat = chats[position]
        holder.name.text = chat.name
        holder.preview.text = chat.lastMessagePreview.ifBlank { "No messages yet" }
        holder.avatar.text = chat.avatarInitial

        val bg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            color = android.content.res.ColorStateList.valueOf(
                runCatching { Color.parseColor(chat.avatarColor) }.getOrDefault(Color.parseColor("#94a3b8")),
            )
        }
        holder.avatar.background = bg
        holder.itemView.setOnClickListener { onClick(chat) }
    }

    override fun getItemCount() = chats.size
}
