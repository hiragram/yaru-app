use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Task {
    id: String,
    title: String,
    done: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    done_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskData {
    tasks: Vec<Task>,
}

struct AppState {
    data: Mutex<TaskData>,
    file_path: PathBuf,
}

fn get_data_path() -> PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("yaru");
    fs::create_dir_all(&dir).ok();
    dir.join("tasks.json")
}

fn load_data(path: &PathBuf) -> TaskData {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(TaskData { tasks: vec![] })
}

fn save_data(path: &PathBuf, data: &TaskData) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_tasks(state: State<AppState>) -> Vec<Task> {
    state.data.lock().unwrap().tasks.clone()
}

#[tauri::command]
fn add_task(state: State<AppState>, title: String, to_front: bool) -> Result<Vec<Task>, String> {
    let mut data = state.data.lock().unwrap();
    let task = Task {
        id: Uuid::new_v4().to_string(),
        title,
        done: false,
        done_at: None,
    };
    if to_front {
        data.tasks.insert(0, task);
    } else {
        data.tasks.push(task);
    }
    save_data(&state.file_path, &data)?;
    Ok(data.tasks.clone())
}

#[tauri::command]
fn toggle_task(state: State<AppState>, id: String) -> Result<Vec<Task>, String> {
    let mut data = state.data.lock().unwrap();
    let Some(idx) = data.tasks.iter().position(|t| t.id == id) else {
        return Ok(data.tasks.clone());
    };
    let was_done = data.tasks[idx].done;
    data.tasks[idx].done = !was_done;
    if !was_done {
        // Completing: record timestamp and move to top
        data.tasks[idx].done_at = Some(Utc::now().to_rfc3339());
        let task = data.tasks.remove(idx);
        data.tasks.insert(0, task);
    } else {
        // Uncompleting: clear timestamp, stay in place
        data.tasks[idx].done_at = None;
    }
    save_data(&state.file_path, &data)?;
    Ok(data.tasks.clone())
}

#[tauri::command]
fn edit_task(state: State<AppState>, id: String, title: String) -> Result<Vec<Task>, String> {
    let mut data = state.data.lock().unwrap();
    if let Some(task) = data.tasks.iter_mut().find(|t| t.id == id) {
        task.title = title;
    }
    save_data(&state.file_path, &data)?;
    Ok(data.tasks.clone())
}

#[tauri::command]
fn delete_task(state: State<AppState>, id: String) -> Result<Vec<Task>, String> {
    let mut data = state.data.lock().unwrap();
    data.tasks.retain(|t| t.id != id);
    save_data(&state.file_path, &data)?;
    Ok(data.tasks.clone())
}

#[tauri::command]
fn move_task(state: State<AppState>, id: String, direction: i32) -> Result<Vec<Task>, String> {
    let mut data = state.data.lock().unwrap();
    let Some(idx) = data.tasks.iter().position(|t| t.id == id) else {
        return Ok(data.tasks.clone());
    };
    let new_idx = idx as i32 + direction;
    if new_idx < 0 || new_idx >= data.tasks.len() as i32 {
        return Ok(data.tasks.clone());
    }
    let new_idx = new_idx as usize;
    data.tasks.swap(idx, new_idx);
    save_data(&state.file_path, &data)?;
    Ok(data.tasks.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let file_path = get_data_path();
    let data = load_data(&file_path);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            data: Mutex::new(data),
            file_path,
        })
        .invoke_handler(tauri::generate_handler![
            get_tasks,
            add_task,
            toggle_task,
            edit_task,
            delete_task,
            move_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
