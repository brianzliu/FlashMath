use image::GenericImageView;
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

#[tauri::command]
pub async fn crop_region(
    app: tauri::AppHandle,
    image_path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let img = image::open(&image_path).map_err(|e| format!("Failed to open image: {}", e))?;

    let (img_w, img_h) = img.dimensions();
    if x + width > img_w || y + height > img_h {
        return Err("Crop region exceeds image bounds".to_string());
    }

    let cropped = img.crop_imm(x, y, width, height);

    let captures_dir = get_captures_dir(&app)?;
    let filename = format!("{}.png", Uuid::new_v4());
    let output_path = captures_dir.join(&filename);

    cropped
        .save(&output_path)
        .map_err(|e| format!("Failed to save cropped image: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_image_from_data_url(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<String, String> {
    let data = if let Some(base64_data) = data_url.strip_prefix("data:image/png;base64,") {
        base64_data
    } else if let Some(base64_data) = data_url.strip_prefix("data:image/jpeg;base64,") {
        base64_data
    } else {
        return Err("Unsupported image format in data URL".to_string());
    };

    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        data,
    )
    .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let captures_dir = get_captures_dir(&app)?;
    let filename = format!("{}.png", Uuid::new_v4());
    let output_path = captures_dir.join(&filename);

    tokio::fs::write(&output_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
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
