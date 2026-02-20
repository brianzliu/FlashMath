use std::io::Cursor;
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

#[tauri::command]
pub async fn get_image_as_data_url(
    image_path: String,
) -> Result<String, String> {
    use super::capture::load_image_oriented;

    let img = load_image_oriented(&image_path)?;

    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode image: {}", e))?;

    let b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &buf,
    );

    Ok(format!("data:image/png;base64,{}", b64))
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
