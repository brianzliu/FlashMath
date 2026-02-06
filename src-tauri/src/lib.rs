mod commands;
mod srs;

use commands::database::get_migrations;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:flashmath.db", get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Capture
            commands::capture::crop_region,
            commands::capture::save_image_from_data_url,
            // LLM
            commands::llm::ocr_image,
            commands::llm::assess_difficulty,
            commands::llm::get_llm_config,
            commands::llm::set_llm_config,
            commands::llm::test_llm_connection,
            // Files
            commands::files::get_image_as_data_url,
            commands::files::copy_image_to_app_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
