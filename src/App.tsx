import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Task {
  id: string;
  title: string;
  done: boolean;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [addingMode, setAddingMode] = useState<"front" | "back" | null>(null);
  const [newText, setNewText] = useState("");
  const [copied, setCopied] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(async () => {
    const data = await invoke<Task[]>("get_tasks");
    setTasks(data);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const addTask = async (title: string, toFront: boolean) => {
    if (!title.trim()) return;
    const data = await invoke<Task[]>("add_task", {
      title: title.trim(),
      toFront,
    });
    setTasks(data);
    setNewText("");
    setAddingMode(null);
    if (toFront) {
      setSelectedIndex(0);
    } else {
      setSelectedIndex(data.length - 1);
    }
  };

  const toggleTask = async (id: string) => {
    const data = await invoke<Task[]>("toggle_task", { id });
    setTasks(data);
  };

  const editTask = async (id: string, title: string) => {
    if (!title.trim()) return;
    const data = await invoke<Task[]>("edit_task", { id, title: title.trim() });
    setTasks(data);
    setEditingId(null);
  };

  const deleteTask = async (id: string) => {
    const data = await invoke<Task[]>("delete_task", { id });
    setTasks(data);
    if (selectedIndex >= data.length) {
      setSelectedIndex(Math.max(0, data.length - 1));
    }
  };

  const moveTask = async (id: string, direction: number) => {
    const data = await invoke<Task[]>("move_task", { id, direction });
    setTasks(data);
    const newIdx = data.findIndex((t) => t.id === id);
    if (newIdx !== -1) setSelectedIndex(newIdx);
  };

  const startEditing = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const startAdding = (mode: "front" | "back") => {
    setAddingMode(mode);
    setNewText("");
    setTimeout(() => addInputRef.current?.focus(), 0);
  };

  const copyListToClipboard = async () => {
    if (tasks.length === 0) return;
    const text = tasks
      .map((t) => `${t.done ? "✅" : "⬜"} ${t.title}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editingId || addingMode) return;

      const selected = tasks[selectedIndex];

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (e.shiftKey && selected) {
            moveTask(selected.id, -1);
          } else {
            setSelectedIndex((i) => Math.max(0, i - 1));
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (e.shiftKey && selected) {
            moveTask(selected.id, 1);
          } else {
            setSelectedIndex((i) => Math.min(tasks.length - 1, i + 1));
          }
          break;
        case "Enter":
          e.preventDefault();
          if (selected) toggleTask(selected.id);
          break;
        case "n":
          e.preventDefault();
          startAdding("back");
          break;
        case "N":
          e.preventDefault();
          startAdding("front");
          break;
        case "e":
        case "F2":
          e.preventDefault();
          if (selected && !selected.done) startEditing(selected);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (selected) deleteTask(selected.id);
          break;
        case "Escape":
          e.preventDefault();
          setSelectedIndex(-1);
          break;
        case "c":
          e.preventDefault();
          copyListToClipboard();
          break;
      }
    },
    [editingId, addingMode, tasks, selectedIndex],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (selectedIndex >= tasks.length) {
      setSelectedIndex(Math.max(0, tasks.length - 1));
    }
  }, [tasks.length, selectedIndex]);

  return (
    <div className="app">
      <header className="header">
        <h1>Yaru</h1>
        <div className="hint">
          <span><kbd>n</kbd> add</span>
          <span><kbd>N</kbd> add top</span>
          <span><kbd>Enter</kbd> toggle</span>
          <span><kbd>e</kbd> edit</span>
          <span><kbd>Del</kbd> delete</span>
          <span><kbd>Shift+↑↓</kbd> move</span>
          <span><kbd>c</kbd> copy</span>
        </div>
        {copied && <div className="copied-toast">Copied!</div>}
      </header>

      <div className="task-list">
        {addingMode === "front" && (
          <div className="task-item adding">
            <div className="checkbox" />
            <input
              ref={addInputRef}
              className="task-input"
              value={newText}
              placeholder="New task..."
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask(newText, true);
                if (e.key === "Escape") {
                  setAddingMode(null);
                  setNewText("");
                }
              }}
              onBlur={() => {
                if (newText.trim()) {
                  addTask(newText, true);
                } else {
                  setAddingMode(null);
                }
              }}
            />
          </div>
        )}

        {tasks.map((task, index) => {
          const isSelected = index === selectedIndex;
          const isEditing = editingId === task.id;
          const firstUndoneIndex = tasks.findIndex((t) => !t.done);
          const isNext = index === firstUndoneIndex;

          return (
            <div key={task.id}>
              <div
                className={`task-item ${isNext ? "next" : ""} ${isSelected ? "selected" : ""} ${task.done ? "done" : ""}`}
                onClick={() => setSelectedIndex(index)}
                onDoubleClick={() => {
                  if (!task.done) startEditing(task);
                }}
              >
                <button
                  className={`checkbox ${task.done ? "checked" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTask(task.id);
                  }}
                >
                  {task.done && "✓"}
                </button>
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    className="task-input"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") editTask(task.id, editText);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => editTask(task.id, editText)}
                  />
                ) : (
                  <span className="task-title">{task.title}</span>
                )}
              </div>
            </div>
          );
        })}

        {addingMode === "back" && (
          <div className="task-item adding">
            <div className="checkbox" />
            <input
              ref={addInputRef}
              className="task-input"
              value={newText}
              placeholder="New task..."
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask(newText, false);
                if (e.key === "Escape") {
                  setAddingMode(null);
                  setNewText("");
                }
              }}
              onBlur={() => {
                if (newText.trim()) {
                  addTask(newText, false);
                } else {
                  setAddingMode(null);
                }
              }}
            />
          </div>
        )}

        {tasks.length === 0 && !addingMode && (
          <div className="empty">
            <p>No tasks yet</p>
            <p className="empty-hint">Press <kbd>n</kbd> to add a task</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
