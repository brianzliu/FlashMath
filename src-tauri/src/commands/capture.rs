use base64::Engine;
use image::{DynamicImage, GenericImageView, ImageReader};
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

fn read_exif_orientation(path: &str) -> u32 {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut buf = std::io::BufReader::new(file);
    let reader = match exif::Reader::new().read_from_container(&mut buf) {
        Ok(r) => r,
        Err(_) => return 1,
    };
    reader
        .get_field(exif::Tag::Orientation, exif::In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
        .unwrap_or(1)
}

fn apply_orientation(img: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img, // 1 = normal, or unknown
    }
}

pub fn load_image_oriented(path: &str) -> Result<DynamicImage, String> {
    let orientation = read_exif_orientation(path);
    let img = ImageReader::open(path)
        .map_err(|e| format!("Failed to open image: {}", e))?
        .with_guessed_format()
        .map_err(|e| format!("Failed to guess image format: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {}", e))?;
    Ok(apply_orientation(img, orientation))
}

#[tauri::command]
pub async fn crop_region(
    app: tauri::AppHandle,
    image_path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let img = load_image_oriented(&image_path)?;

    let (img_w, img_h) = img.dimensions();
    let x = x.min(img_w.saturating_sub(1));
    let y = y.min(img_h.saturating_sub(1));
    let width = width.min(img_w - x).max(1);
    let height = height.min(img_h - y).max(1);

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
    let (data, ext) = if let Some(base64_data) = data_url.strip_prefix("data:image/png;base64,") {
        (base64_data, "png")
    } else if let Some(base64_data) = data_url.strip_prefix("data:image/jpeg;base64,") {
        (base64_data, "jpg")
    } else if let Some(base64_data) = data_url.strip_prefix("data:image/webp;base64,") {
        (base64_data, "webp")
    } else if let Some(base64_data) = data_url.strip_prefix("data:image/gif;base64,") {
        (base64_data, "gif")
    } else if let Some(base64_data) = data_url.strip_prefix("data:image/bmp;base64,") {
        (base64_data, "bmp")
    } else {
        return Err("Unsupported image format in data URL".to_string());
    };

    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        data,
    )
    .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let captures_dir = get_captures_dir(&app)?;
    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let output_path = captures_dir.join(&filename);

    tokio::fs::write(&output_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn take_screenshot(
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    // Hide the app window so user can capture what's behind it
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    // Small delay to let the window hide
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    let captures_dir = get_captures_dir(&app)?;
    let filename = format!("{}.png", Uuid::new_v4());
    let output_path = captures_dir.join(&filename);

    // Run macOS screencapture (interactive selection, no sound)
    let status = std::process::Command::new("screencapture")
        .arg("-i")  // interactive (user selects region)
        .arg("-x")  // no sound
        .arg(output_path.to_string_lossy().to_string())
        .status()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    // Show the window again
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    if !status.success() {
        // User cancelled the capture (pressed Escape)
        return Ok(None);
    }

    // Verify file exists
    if !output_path.exists() {
        return Ok(None);
    }

    // Read the file and return as data URL
    let bytes = tokio::fs::read(&output_path)
        .await
        .map_err(|e| format!("Failed to read screenshot: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:image/png;base64,{}", b64);

    Ok(Some(data_url))
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
