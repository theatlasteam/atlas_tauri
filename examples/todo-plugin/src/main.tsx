import { For, Show, createSignal } from "solid-js";
import { Button, Chip, List, ListItem } from "atlas/ui";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

// A tiny, self-contained todo list. Every Atlas plugin gets a `storage` object
// that survives restarts, so we can keep items without a database.
//
// Components from the app (Button, List, ListItem, Chip) are imported from
// "atlas/ui", so the plugin's UI matches the host app and stays editable in
// one place. Everything here uses kebab-case inline styles (Solid bakes style
// objects into DOM strings verbatim — camelCase keys are ignored by the
// browser).

export function activate(ctx) {
  ctx.log("Todo active");

  const storageKey = "items";
  const load = (): Todo[] => ctx.storage.getJSON<Todo[]>(storageKey) ?? [];
  const save = (items: Todo[]) => ctx.storage.setJSON(storageKey, items);

  ctx.ui.configScreen(({ plugin, onClose }) => <Config plugin={plugin} onClose={onClose} />);

  function Config(props: { plugin: { id: string; name: string }; onClose: () => void }) {
    const [text, setText] = createSignal("");
    const [items, setItems] = createSignal<Todo[]>(load());

    const add = () => {
      const value = text().trim();
      if (!value) return;
      setItems([...items(), { id: Date.now(), text: value, done: false }]);
      save(items());
      setText("");
    };

    const toggle = (id: number) => {
      setItems(items().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
      save(items());
    };

    const clear = () => {
      setItems([]);
      save([]);
    };

    return (
      <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="New todo…"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={{
              flex: "1",
              padding: "8px 12px",
              "border-radius": "999px",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-ink)",
              "font-size": "14px",
            }}
          />
          <Button size="sm" onClick={add}>Add</Button>
        </div>

        <Show
          when={items().length}
          fallback={
            <p style={{ "font-size": "13px", color: "var(--color-ink-subtle)", "text-align": "center" }}>
              Nothing here yet — add a todo above.
            </p>
          }
        >
          <List>
            <For each={items()}>
              {(todo) => (
                <ListItem
                  title={todo.text}
                  leading={
                    <button
                      type="button"
                      onClick={() => toggle(todo.id)}
                      style={{
                        width: "22px",
                        height: "22px",
                        "border-radius": "999px",
                        border: `2px solid ${todo.done ? "var(--color-accent)" : "var(--color-border)"}`,
                        background: todo.done ? "var(--color-accent)" : "transparent",
                        display: "inline-flex",
                        "align-items": "center",
                        "justify-content": "center",
                        cursor: "pointer",
                      }}
                    >
                      {todo.done && (
                        <span style={{ color: "var(--color-accent-ink)", "font-size": "12px" }}>✓</span>
                      )}
                    </button>
                  }
                  trailing={todo.done ? <Chip color="accent">done</Chip> : <Chip color="muted">open</Chip>}
                />
              )}
            </For>
          </List>
        </Show>

        <div style={{ display: "flex", "justify-content": "space-between", gap: "8px" }}>
          <Button variant="ghost" size="sm" onClick={clear}>Clear all</Button>
          <Button variant="soft" size="sm" onClick={props.onClose}>Close</Button>
        </div>
      </div>
    );
  }
}
