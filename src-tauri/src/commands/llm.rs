use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub base_url: String,
}

#[tauri::command]
pub async fn ocr_image(
    app: tauri::AppHandle,
    image_path: String,
) -> Result<String, String> {
    let config = load_llm_config(&app)?;
    let image_bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|e| format!("Failed to read image: {}", e))?;

    let base64_image = base64::engine::general_purpose::STANDARD.encode(&image_bytes);

    let ext = Path::new(&image_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime_type = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };

    let prompt = "You are a math OCR system. Convert the math in this image to LaTeX.\n\n\
        Rules:\n\
        1. Use standard LaTeX math notation (e.g., \\frac{a}{b}, \\int, \\sum)\n\
        2. If there are multiple lines, use \\begin{align*} ... \\end{align*}\n\
        3. If you cannot read part of the expression, use \\text{[illegible]}\n\
        4. Return ONLY the LaTeX code, no explanations or delimiters";

    let response = call_llm_vision(&config, prompt, &base64_image, mime_type).await?;
    Ok(response.trim().to_string())
}

#[tauri::command]
pub async fn assess_difficulty(
    app: tauri::AppHandle,
    latex: String,
) -> Result<i32, String> {
    let config = load_llm_config(&app)?;

    let prompt = format!(
        "Given this math problem, estimate how many seconds a student would need to solve it. \
         Return ONLY a number (seconds), nothing else.\n\nProblem: {}",
        latex
    );

    let response = call_llm_text(&config, &prompt).await?;
    let seconds = response
        .trim()
        .parse::<i32>()
        .unwrap_or(300);

    // Clamp to reasonable range
    Ok(seconds.clamp(30, 3600))
}

#[tauri::command]
pub async fn get_llm_config(app: tauri::AppHandle) -> Result<LLMConfig, String> {
    load_llm_config(&app)
}

#[tauri::command]
pub async fn set_llm_config(
    app: tauri::AppHandle,
    config: LLMConfig,
) -> Result<(), String> {
    save_llm_config(&app, &config)
}

#[tauri::command]
pub async fn test_llm_connection(app: tauri::AppHandle) -> Result<String, String> {
    let config = load_llm_config(&app)?;
    let response = call_llm_text(&config, "Respond with 'ok'").await?;
    Ok(response)
}

fn load_llm_config(app: &tauri::AppHandle) -> Result<LLMConfig, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let config_path = app_data.join("llm_config.json");

    if !config_path.exists() {
        return Err("LLM not configured. Go to Settings to set up your LLM provider.".to_string());
    }

    let contents = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    serde_json::from_str(&contents).map_err(|e| format!("Failed to parse config: {}", e))
}

fn save_llm_config(app: &tauri::AppHandle, config: &LLMConfig) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&app_data)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    let config_path = app_data.join("llm_config.json");

    let contents =
        serde_json::to_string_pretty(config).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&config_path, contents)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

async fn call_llm_vision(
    config: &LLMConfig,
    prompt: &str,
    base64_image: &str,
    mime_type: &str,
) -> Result<String, String> {
    let (url, headers, body) = match config.provider.as_str() {
        "anthropic" => {
            let url = if config.base_url.is_empty() {
                "https://api.anthropic.com/v1/messages".to_string()
            } else {
                format!("{}/v1/messages", config.base_url.trim_end_matches('/'))
            };

            let body = json!({
                "model": config.model,
                "max_tokens": 4096,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": base64_image
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }]
            });

            (
                url,
                vec![
                    ("x-api-key".to_string(), config.api_key.clone()),
                    ("anthropic-version".to_string(), "2023-06-01".to_string()),
                    ("content-type".to_string(), "application/json".to_string()),
                ],
                body,
            )
        }
        _ => {
            // OpenAI-compatible (openai, ollama, openrouter, custom)
            let url = match config.provider.as_str() {
                "openrouter" => {
                    if config.base_url.is_empty() {
                        "https://openrouter.ai/api/v1/chat/completions".to_string()
                    } else {
                        format!(
                            "{}/v1/chat/completions",
                            config.base_url.trim_end_matches('/')
                        )
                    }
                }
                _ => {
                    if config.base_url.is_empty() {
                        "https://api.openai.com/v1/chat/completions".to_string()
                    } else {
                        format!(
                            "{}/v1/chat/completions",
                            config.base_url.trim_end_matches('/')
                        )
                    }
                }
            };

            let body = json!({
                "model": config.model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:{};base64,{}", mime_type, base64_image)
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }],
                "max_tokens": 4096
            });

            let mut headers = vec![
                ("content-type".to_string(), "application/json".to_string()),
            ];
            if !config.api_key.is_empty() {
                headers.push((
                    "authorization".to_string(),
                    format!("Bearer {}", config.api_key),
                ));
            }
            // OpenRouter requires HTTP-Referer header
            if config.provider == "openrouter" {
                headers.push((
                    "http-referer".to_string(),
                    "https://flashmath.app".to_string(),
                ));
                headers.push((
                    "x-title".to_string(),
                    "FlashMath".to_string(),
                ));
            }

            (url, headers, body)
        }
    };

    send_llm_request(&url, &headers, &body).await
}

async fn call_llm_text(config: &LLMConfig, prompt: &str) -> Result<String, String> {
    let (url, headers, body) = match config.provider.as_str() {
        "anthropic" => {
            let url = if config.base_url.is_empty() {
                "https://api.anthropic.com/v1/messages".to_string()
            } else {
                format!("{}/v1/messages", config.base_url.trim_end_matches('/'))
            };

            let body = json!({
                "model": config.model,
                "max_tokens": 1024,
                "messages": [{
                    "role": "user",
                    "content": prompt
                }]
            });

            (
                url,
                vec![
                    ("x-api-key".to_string(), config.api_key.clone()),
                    ("anthropic-version".to_string(), "2023-06-01".to_string()),
                    ("content-type".to_string(), "application/json".to_string()),
                ],
                body,
            )
        }
        _ => {
            let url = match config.provider.as_str() {
                "openrouter" => {
                    if config.base_url.is_empty() {
                        "https://openrouter.ai/api/v1/chat/completions".to_string()
                    } else {
                        format!(
                            "{}/v1/chat/completions",
                            config.base_url.trim_end_matches('/')
                        )
                    }
                }
                _ => {
                    if config.base_url.is_empty() {
                        "https://api.openai.com/v1/chat/completions".to_string()
                    } else {
                        format!(
                            "{}/v1/chat/completions",
                            config.base_url.trim_end_matches('/')
                        )
                    }
                }
            };

            let body = json!({
                "model": config.model,
                "messages": [{
                    "role": "user",
                    "content": prompt
                }],
                "max_tokens": 1024
            });

            let mut headers = vec![
                ("content-type".to_string(), "application/json".to_string()),
            ];
            if !config.api_key.is_empty() {
                headers.push((
                    "authorization".to_string(),
                    format!("Bearer {}", config.api_key),
                ));
            }
            if config.provider == "openrouter" {
                headers.push((
                    "http-referer".to_string(),
                    "https://flashmath.app".to_string(),
                ));
                headers.push((
                    "x-title".to_string(),
                    "FlashMath".to_string(),
                ));
            }

            (url, headers, body)
        }
    };

    send_llm_request(&url, &headers, &body).await
}

async fn send_llm_request(
    url: &str,
    headers: &[(String, String)],
    body: &Value,
) -> Result<String, String> {
    let client = Client::new();
    let mut req = client.post(url);

    for (key, value) in headers {
        req = req.header(key.as_str(), value.as_str());
    }

    let resp = req
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("LLM API error ({}): {}", status, text));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Extract text from response - handle both OpenAI and Anthropic formats
    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        Ok(content.to_string())
    } else if let Some(content) = json["content"][0]["text"].as_str() {
        Ok(content.to_string())
    } else {
        Err(format!("Unexpected response format: {}", json))
    }
}
