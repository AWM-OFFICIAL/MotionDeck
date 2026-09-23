mod cursor;

use cursor::{CursorCapture, CursorSample};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

/// Reported to the frontend so the UI can enable/disable native-only affordances
/// instead of offering controls that silently do nothing.
#[derive(Debug, Clone, Serialize)]
pub struct NativeCapabilities {
    pub platform: String,
    pub arch: String,
    /// Global cursor + click sampling during recording.
    pub native_cursor_capture: bool,
    /// An `ffmpeg` binary was found on PATH — enables high-quality/long-recording remux.
    pub ffmpeg: bool,
    pub ffmpeg_path: Option<String>,
    /// Region/window capture is delegated to the OS picker in the WebView.
    pub display_media_picker: bool,
}

struct AppState {
    cursor: CursorCapture,
}

#[tauri::command]
fn native_capabilities() -> NativeCapabilities {
    let ffmpeg_path = which::which("ffmpeg")
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    NativeCapabilities {
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        native_cursor_capture: true,
        ffmpeg: ffmpeg_path.is_some(),
        ffmpeg_path,
        display_media_picker: true,
    }
}

#[tauri::command]
fn start_cursor_capture(state: State<'_, Mutex<AppState>>, hz: Option<u32>) -> Result<bool, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.cursor.start(hz.unwrap_or(120)))
}

#[tauri::command]
fn stop_cursor_capture(state: State<'_, Mutex<AppState>>) -> Result<Vec<CursorSample>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.cursor.stop())
}

#[tauri::command]
fn cursor_position() -> (i32, i32) {
    CursorCapture::position()
}

#[tauri::command]
fn cursor_left_down() -> bool {
    CursorCapture::left_down()
}

/// Only files the app just wrote under the OS temp directory may be remuxed.
fn path_is_temp_media(path: &str) -> bool {
    let Some(canonical_parent_intent) = std::path::Path::new(path).parent() else {
        return false;
    };
    let Ok(temp) = std::env::temp_dir().canonicalize() else {
        return false;
    };
    let Ok(parent) = canonical_parent_intent.canonicalize() else {
        return false;
    };
    let name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    parent.starts_with(&temp)
        && name.starts_with("motiondeck-")
        && !name.starts_with('-')
        && !path.contains('\0')
}

#[tauri::command]
fn remux_video_file(input_path: String, output_path: String) -> Result<(), String> {
    if !path_is_temp_media(&input_path) || !path_is_temp_media(&output_path) {
        return Err("Conversion is limited to MotionDeck temporary files.".into());
    }
    let ffmpeg = which::which("ffmpeg").map_err(|_| {
        "FFmpeg was not found. MotionDeck will try its built-in converter instead.".to_string()
    })?;

    // Prefer lossless remux when codecs fit in MP4.
    let copy_ok = std::process::Command::new(&ffmpeg)
        .args([
            "-y",
            "-i",
            &input_path,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            &output_path,
        ])
        .status()
        .map_err(|e| format!("FFmpeg remux failed to start: {e}"))?
        .success();

    if copy_ok && std::path::Path::new(&output_path).is_file() {
        let meta = std::fs::metadata(&output_path).map_err(|e| e.to_string())?;
        if meta.len() > 1024 {
            return Ok(());
        }
    }

    let _ = std::fs::remove_file(&output_path);

    let encode_ok = std::process::Command::new(&ffmpeg)
        .args([
            "-y",
            "-i",
            &input_path,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            &output_path,
        ])
        .status()
        .map_err(|e| format!("FFmpeg transcode failed to start: {e}"))?
        .success();

    if !encode_ok || !std::path::Path::new(&output_path).is_file() {
        return Err(
            "FFmpeg could not convert this file. Export as MP4 (H.264 + AAC) from your capture tool."
                .into(),
        );
    }
    Ok(())
}

/// Keeps the floating recording controls above the user's application without
/// stealing focus from it.
#[tauri::command]
fn set_overlay_mode(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(Mutex::new(AppState {
                cursor: CursorCapture::new(),
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_capabilities,
            start_cursor_capture,
            stop_cursor_capture,
            cursor_position,
            cursor_left_down,
            set_overlay_mode,
            remux_video_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MotionDeck");
}
