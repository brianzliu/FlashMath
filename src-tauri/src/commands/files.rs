use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

#[tauri::command]
pub async fn get_image_as_data_url(
    image_path: String,
) -> Result<String, String> {
    let bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|e| format!("Failed to read image: {}", e))?;

    let ext = std::path::Path::new(&image_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");

    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };

    let b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &bytes,
    );

    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub async fn copy_image_to_app_data(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<String, String> {
    let captures_dir = get_captures_dir(&app)?;
    let ext = std::path::Path::new(&source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");

    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let dest_path = captures_dir.join(&filename);

    tokio::fs::copy(&source_path, &dest_path)
        .await
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    Ok(dest_path.to_string_lossy().to_string())
}

fn get_captures_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let captures_dir = app_data.join("captures");
    std::fs::create_dir_all(&captures_dir)
        .map_err(|e| format!("Failed to create captures directory: {}", e))?;
    Ok(captures_dir)
}
