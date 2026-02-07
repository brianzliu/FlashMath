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

#[tauri::command]
pub async fn generate_image_title(
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

    let prompt = "You are a helpful assistant that generates concise, descriptive titles for flashcard questions. \
        Look at this image which contains a question (likely a math problem or similar academic question). \
        Generate a short, descriptive title (maximum 60 characters) that summarizes what the question is about. \
        Return ONLY the title, no quotes, no explanations.";

    let response = call_llm_vision(&config, prompt, &base64_image, mime_type).await?;
    let mut title = response.trim().to_string();

    // Truncate if too long
    if title.len() > 80 {
        title.truncate(77);
        title.push_str("...");
    }

    Ok(title)
}

#[tauri::command]
pub async fn generate_latex_title(
    app: tauri::AppHandle,
    latex: String,
) -> Result<String, String> {
    let config = load_llm_config(&app)?;

    let prompt = format!(
        "Generate a short, descriptive title (maximum 60 characters) for this flashcard question. \
         The title should summarize what the question is about. \
         Return ONLY the title, no quotes, no explanations.\n\nQuestion (LaTeX): {}",
        latex
    );

    let response = call_llm_text(&config, &prompt).await?;
    let mut title = response.trim().to_string();
    if title.len() > 80 {
        title.truncate(77);
        title.push_str("...");
    }
    Ok(title)
}

#[tauri::command]
pub async fn generate_answer(
    app: tauri::AppHandle,
    question_content: String,
    question_type: String,
) -> Result<String, String> {
    let config = load_llm_config(&app)?;

    if question_type == "image" {
        // Vision-based: read image and ask LLM to solve it
        let image_bytes = tokio::fs::read(&question_content)
            .await
            .map_err(|e| format!("Failed to read image: {}", e))?;
        let base64_image = base64::engine::general_purpose::STANDARD.encode(&image_bytes);
        let ext = Path::new(&question_content)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let mime_type = match ext {
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "image/png",
        };

        let prompt = "Look at this flashcard question image. Provide a clear, concise answer.\n\n\
            - If the question involves math: solve it and write the answer using LaTeX notation \
            (e.g., \\frac{a}{b}, \\int, \\sum). Use \\text{} for any plain text mixed with math.\n\
            - If the question is non-math (definitions, vocab, history, etc.): answer in plain text.\n\n\
            Return ONLY the answer. No explanations, no markdown, no code fences.";
        call_llm_vision(&config, prompt, &base64_image, mime_type).await
    } else {
        let prompt = format!(
            "Answer this flashcard question. Provide a clear, concise answer.\n\n\
             - If the question involves math: solve it and use LaTeX notation. \
             Use \\text{{}} for any plain text mixed with math.\n\
             - If non-math: answer in plain text.\n\n\
             Return ONLY the answer. No explanations, no markdown, no code fences.\n\nQuestion: {}",
            question_content
        );
        call_llm_text(&config, &prompt).await
    }
}

#[tauri::command]
pub async fn generate_question(
    app: tauri::AppHandle,
    answer_content: String,
    answer_type: String,
) -> Result<String, String> {
    let config = load_llm_config(&app)?;

    if answer_type == "image" {
        let image_bytes = tokio::fs::read(&answer_content)
            .await
            .map_err(|e| format!("Failed to read image: {}", e))?;
        let base64_image = base64::engine::general_purpose::STANDARD.encode(&image_bytes);
        let ext = Path::new(&answer_content)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let mime_type = match ext {
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "image/png",
        };

        let prompt = "Look at this flashcard answer image. Generate a clear, concise question that this answers.\n\n\
            - If the answer involves math: write the question using LaTeX notation. \
            Use \\text{} for plain text mixed with math.\n\
            - If non-math: write the question in plain text.\n\n\
            Return ONLY the question. No explanations, no markdown, no code fences.";
        call_llm_vision(&config, prompt, &base64_image, mime_type).await
    } else {
        let prompt = format!(
            "Given this answer, generate a clear, concise flashcard question.\n\n\
             - If the answer involves math: use LaTeX notation. Use \\text{{}} for plain text mixed with math.\n\
             - If non-math: write in plain text.\n\n\
             Return ONLY the question. No explanations, no markdown, no code fences.\n\nAnswer: {}",
            answer_content
        );
        call_llm_text(&config, &prompt).await
    }
}

#[tauri::command]
pub async fn convert_image_to_text(
    app: tauri::AppHandle,
    image_path: String,
    role: String,
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

    let prompt = format!(
        "You are converting a flashcard {} image to text. Analyze the image and respond appropriately:\n\n\
         - If the image contains math equations, formulas, or mathematical problems: \
         convert them to LaTeX notation (e.g., \\frac{{a}}{{b}}, \\int, \\sum). \
         For multiple lines of math, use \\begin{{align*}} ... \\end{{align*}}.\n\
         - If the image contains a MIX of plain text and math: \
         use \\text{{}} for the plain text parts and LaTeX for the math parts. \
         For example: \\text{{Find the derivative of }} f(x) = x^2 + 3x\n\
         - If the image contains ONLY plain text (definitions, vocabulary, history, etc.): \
         return the text as-is, cleanly formatted. Do NOT wrap plain text in LaTeX commands.\n\n\
         Return ONLY the converted content. No explanations, no markdown delimiters, no code fences.",
        role
    );

    let response = call_llm_vision(&config, &prompt, &base64_image, mime_type).await?;
    Ok(response.trim().to_string())
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

// --- Chat completion with tool support ---

#[tauri::command]
pub async fn chat_completion(
    app: tauri::AppHandle,
    messages: Value,
    tools: Option<Value>,
) -> Result<Value, String> {
    let config = load_llm_config(&app)?;
    let (url, headers, body) = build_chat_request(&config, &messages, tools.as_ref());
    send_llm_request_raw(&url, &headers, &body).await
}

fn build_chat_request(
    config: &LLMConfig,
    messages: &Value,
    tools: Option<&Value>,
) -> (String, Vec<(String, String)>, Value) {
    match config.provider.as_str() {
        "anthropic" => {
            let url = if config.base_url.is_empty() {
                "https://api.anthropic.com/v1/messages".to_string()
            } else {
                format!("{}/v1/messages", config.base_url.trim_end_matches('/'))
            };

            // Convert OpenAI-format messages to Anthropic format
            let mut system_prompt = String::new();
            let mut anthropic_messages: Vec<Value> = Vec::new();
            if let Some(msgs) = messages.as_array() {
                for msg in msgs {
                    let role = msg["role"].as_str().unwrap_or("user");
                    if role == "system" {
                        system_prompt = msg["content"].as_str().unwrap_or("").to_string();
                    } else if role == "tool" {
                        anthropic_messages.push(json!({
                            "role": "user",
                            "content": [{
                                "type": "tool_result",
                                "tool_use_id": msg["tool_call_id"].as_str().unwrap_or(""),
                                "content": msg["content"].as_str().unwrap_or("")
                            }]
                        }));
                    } else if role == "assistant" {
                        if let Some(tool_calls) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                            let mut content_blocks: Vec<Value> = Vec::new();
                            if let Some(text) = msg["content"].as_str() {
                                if !text.is_empty() {
                                    content_blocks.push(json!({"type": "text", "text": text}));
                                }
                            }
                            for tc in tool_calls {
                                content_blocks.push(json!({
                                    "type": "tool_use",
                                    "id": tc["id"].as_str().unwrap_or(""),
                                    "name": tc["function"]["name"].as_str().unwrap_or(""),
                                    "input": serde_json::from_str::<Value>(
                                        tc["function"]["arguments"].as_str().unwrap_or("{}")
                                    ).unwrap_or(json!({}))
                                }));
                            }
                            anthropic_messages.push(json!({"role": "assistant", "content": content_blocks}));
                        } else {
                            anthropic_messages.push(json!({
                                "role": "assistant",
                                "content": msg["content"].as_str().unwrap_or("")
                            }));
                        }
                    } else {
                        anthropic_messages.push(json!({
                            "role": role,
                            "content": msg["content"].as_str().unwrap_or("")
                        }));
                    }
                }
            }

            let mut body = json!({
                "model": config.model,
                "max_tokens": 4096,
                "messages": anthropic_messages
            });
            if !system_prompt.is_empty() {
                body["system"] = json!(system_prompt);
            }
            if let Some(tools_val) = tools {
                if let Some(tools_arr) = tools_val.as_array() {
                    let anthropic_tools: Vec<Value> = tools_arr.iter().map(|t| {
                        json!({
                            "name": t["function"]["name"],
                            "description": t["function"]["description"],
                            "input_schema": t["function"]["parameters"]
                        })
                    }).collect();
                    body["tools"] = json!(anthropic_tools);
                }
            }

            (url, vec![
                ("x-api-key".to_string(), config.api_key.clone()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
                ("content-type".to_string(), "application/json".to_string()),
            ], body)
        }
        _ => {
            let url = match config.provider.as_str() {
                "openrouter" => if config.base_url.is_empty() {
                    "https://openrouter.ai/api/v1/chat/completions".to_string()
                } else {
                    format!("{}/v1/chat/completions", config.base_url.trim_end_matches('/'))
                },
                _ => if config.base_url.is_empty() {
                    "https://api.openai.com/v1/chat/completions".to_string()
                } else {
                    format!("{}/v1/chat/completions", config.base_url.trim_end_matches('/'))
                },
            };

            let mut body = json!({"model": config.model, "messages": messages, "max_tokens": 4096});
            if let Some(tools_val) = tools {
                body["tools"] = tools_val.clone();
            }

            let mut headers = vec![("content-type".to_string(), "application/json".to_string())];
            if !config.api_key.is_empty() {
                headers.push(("authorization".to_string(), format!("Bearer {}", config.api_key)));
            }
            if config.provider == "openrouter" {
                headers.push(("http-referer".to_string(), "https://flashmath.app".to_string()));
                headers.push(("x-title".to_string(), "FlashMath".to_string()));
            }
            (url, headers, body)
        }
    }
}

async fn send_llm_request_raw(
    url: &str,
    headers: &[(String, String)],
    body: &Value,
) -> Result<Value, String> {
    let client = Client::new();
    let mut req = client.post(url);
    for (key, value) in headers {
        req = req.header(key.as_str(), value.as_str());
    }
    let resp = req.json(body).send().await.map_err(|e| format!("Request failed: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("LLM API error ({}): {}", status, text));
    }
    resp.json::<Value>().await.map_err(|e| format!("Failed to parse: {}", e))
}

async fn send_llm_request(
    url: &str,
    headers: &[(String, String)],
    body: &Value,
) -> Result<String, String> {
    let json = send_llm_request_raw(url, headers, body).await?;
    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        Ok(content.to_string())
    } else if let Some(content) = json["content"][0]["text"].as_str() {
        Ok(content.to_string())
    } else {
        Err(format!("Unexpected response format: {}", json))
    }
}
