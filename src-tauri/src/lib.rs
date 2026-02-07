mod commands;
mod srs;

use commands::database::get_migrations;
use tauri::Emitter;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:flashmath.db", get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        log::info!(
                            "Shortcut pressed: mods={:?}, key={:?}",
                            shortcut.mods,
                            shortcut.key
                        );
                        if shortcut.mods.contains(Modifiers::META | Modifiers::SHIFT)
                            && shortcut.key == Code::Digit6
                        {
                            log::info!("Screenshot shortcut detected, emitting event");
                            let _ = app.emit("screenshot-shortcut", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let shortcut = tauri_plugin_global_shortcut::Shortcut::new(
                Some(Modifiers::SUPER | Modifiers::SHIFT),
                Code::Digit6,
            );
            
            match app.global_shortcut().register(shortcut) {
                Ok(_) => log::info!("Screenshot shortcut Cmd+Shift+6 registered successfully"),
                Err(e) => log::error!("Failed to register screenshot shortcut: {}", e),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture::crop_region,
            commands::capture::save_image_from_data_url,
            commands::capture::take_screenshot,
            commands::llm::ocr_image,
            commands::llm::assess_difficulty,
            commands::llm::generate_image_title,
            commands::llm::generate_latex_title,
            commands::llm::generate_answer,
            commands::llm::generate_question,
            commands::llm::convert_image_to_text,
            commands::llm::get_llm_config,
            commands::llm::set_llm_config,
            commands::llm::test_llm_connection,
            commands::llm::chat_completion,
            commands::files::get_image_as_data_url,
            commands::files::copy_image_to_app_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
