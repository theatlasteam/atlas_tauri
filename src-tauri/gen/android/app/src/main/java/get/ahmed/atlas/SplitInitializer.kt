package get.ahmed.atlas

import android.content.Context
import androidx.startup.Initializer
import androidx.window.core.ExperimentalWindowApi
import androidx.window.embedding.RuleController

/**
 * Loads the Activity Embedding split rules at startup so secondary windows
 * render side-by-side with MainActivity on large screens (tablets/foldables).
 * On phones the rules never trigger and activities simply stack.
 */
@OptIn(ExperimentalWindowApi::class)
class SplitInitializer : Initializer<RuleController> {
  override fun create(context: Context): RuleController {
    return RuleController.getInstance(context).apply {
      setRules(RuleController.parseRules(context, R.xml.main_split_config))
    }
  }

  override fun dependencies(): List<Class<out Initializer<*>>> {
    return emptyList()
  }
}
