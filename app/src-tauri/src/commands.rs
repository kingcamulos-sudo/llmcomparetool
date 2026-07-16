use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuestionRequest {
    pub question: String,
    pub chat_id: String,
    pub streaming: bool,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApiConfig {
    pub url: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatchRequest {
    pub api_url: String,
    pub questions: Vec<String>,
    pub chat_id: String,
    pub streaming: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEvent {
    pub question_index: usize,
    pub question: String,
    pub chunk: String,
    pub done: bool,
}

/// Emitted when sourceDocuments or usedTools are received from Flowise
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlowiseExtraEvent {
    pub question_index: usize,
    pub event_type: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuestionResult {
    pub question_index: usize,
    pub question: String,
    pub full_response: String,
    pub timestamp: String,
    pub success: bool,
    pub error: Option<String>,
    pub source_documents: Option<serde_json::Value>,
    pub used_tools: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
}

fn headers_for_log(
    headers: &Option<std::collections::HashMap<String, String>>,
) -> serde_json::Value {
    let Some(headers) = headers else {
        return serde_json::json!({});
    };

    let sanitized = headers
        .iter()
        .map(|(key, value)| {
            let lower_key = key.to_ascii_lowercase();
            let is_sensitive = ["authorization", "cookie", "token", "secret", "api-key", "apikey"]
                .iter()
                .any(|name| lower_key.contains(name));
            (key.clone(), if is_sensitive { "***".to_string() } else { value.clone() })
        })
        .collect::<std::collections::HashMap<_, _>>();

    serde_json::json!(sanitized)
}

fn text_for_log(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let preview = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{}... [truncated, total {} chars]", preview, text.chars().count())
    } else {
        preview
    }
}

#[tauri::command]
pub async fn send_question(
    app: AppHandle,
    api_url: String,
    question: String,
    chat_id: String,
    streaming: bool,
    question_index: usize,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<QuestionResult, String> {
    // Internal API addresses must bypass the macOS system proxy. reqwest enables
    // system proxy discovery by default, which can route private 10.x traffic
    // through a proxy/VPN and turn an otherwise valid request into a 502.
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|error| format!("Create HTTP client failed: {}", error))?;
    let body = serde_json::json!({
        "question": question,
        "chatId": chat_id,
        "streaming": streaming,
    });

    log::info!("[HTTP][question #{}] POST {}", question_index + 1, api_url);
    log::info!("[HTTP][question #{}] proxy: disabled (direct connection)", question_index + 1);
    log::info!(
        "[HTTP][question #{}] request headers: Content-Type=application/json, accept=text/event-stream, custom={}",
        question_index + 1,
        headers_for_log(&headers)
    );
    log::info!("[HTTP][question #{}] request body: {}", question_index + 1, body);

    let mut req = client
        .post(&api_url)
        .header("Content-Type", "application/json")
        .header("accept", "text/event-stream")
        .json(&body);

    // Apply custom headers
    if let Some(custom_headers) = headers {
        for (key, value) in custom_headers {
            req = req.header(&key, &value);
        }
    }

    let response = match req.send().await {
        Ok(response) => response,
        Err(error) => {
            log::error!("[HTTP][question #{}] request failed: {}", question_index + 1, error);
            return Err(format!("Request failed: {}", error));
        }
    };

    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    log::info!(
        "[HTTP][question #{}] response: status={}, content-type={}",
        question_index + 1,
        status,
        content_type
    );
    if !status.is_success() {
        let response_body = response.text().await.unwrap_or_default();
        let detail = response_body.trim();
        log::error!(
            "[HTTP][question #{}] error response body: {}",
            question_index + 1,
            text_for_log(detail, 4000)
        );
        return Err(if detail.is_empty() {
            format!("HTTP request failed: {}", status)
        } else {
            format!("HTTP request failed: {} - {}", status, detail)
        });
    }

    let timestamp = chrono::Utc::now().to_rfc3339();

    if !streaming {
        let text = response
            .text()
            .await
            .map_err(|e| format!("Read response failed: {}", e))?;
        log::info!(
            "[HTTP][question #{}] response body: {}",
            question_index + 1,
            text_for_log(&text, 4000)
        );
        let (parsed, sd, ut, md) = parse_non_stream_response(&text);
        let result = QuestionResult {
            question_index,
            question: question.clone(),
            full_response: parsed,
            timestamp,
            success: true,
            error: None,
            source_documents: sd,
            used_tools: ut,
            metadata: md,
        };
        let _ = app.emit("question-complete", &result);
        return Ok(result);
    }

    let mut full_response = String::new();
    let mut source_documents: Option<serde_json::Value> = None;
    let mut used_tools: Option<serde_json::Value> = None;
    let mut metadata_val: Option<serde_json::Value> = None;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut current_event_type = String::new();
    let mut current_data_lines: Vec<String> = Vec::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(pos) = buffer.find('\n') {
                    let raw_line = buffer[..pos].trim_end_matches('\r').to_string();
                    buffer = buffer[pos + 1..].to_string();
                    if raw_line.is_empty() {
                        if !current_data_lines.is_empty() || !current_event_type.is_empty() {
                            let data = current_data_lines.join("\n");
                            process_sse_event(
                                &app, question_index, &question, &current_event_type, &data,
                                &mut full_response, &mut source_documents, &mut used_tools, &mut metadata_val,
                            );
                            current_event_type.clear();
                            current_data_lines.clear();
                        }
                        continue;
                    }
                    if let Some((field, value)) = split_sse_field(&raw_line) {
                        match field {
                            "event" => current_event_type = value.to_string(),
                            "data" => current_data_lines.push(value.to_string()),
                            "id" | "retry" | "" => {}
                            "message" => current_data_lines.push(value.to_string()),
                            _ => { if !value.is_empty() { current_data_lines.push(value.to_string()); } }
                        }
                    } else if !raw_line.is_empty() && !raw_line.starts_with(':') {
                        current_data_lines.push(raw_line.clone());
                    }
                }
            }
            Err(e) => {
                log::error!("[HTTP][question #{}] SSE stream failed: {}", question_index + 1, e);
                let error_msg = format!("Stream error: {}", e);
                let result = QuestionResult {
                    question_index, question: question.clone(), full_response: full_response.clone(),
                    timestamp, success: false, error: Some(error_msg),
                    source_documents: source_documents.take(), used_tools: used_tools.take(), metadata: metadata_val.take(),
                };
                let _ = app.emit("question-complete", &result);
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    let remaining = buffer.trim();
    if !remaining.is_empty() { current_data_lines.push(remaining.to_string()); }
    if !current_data_lines.is_empty() || !current_event_type.is_empty() {
        let data = current_data_lines.join("\n");
        process_sse_event(
            &app, question_index, &question, &current_event_type, &data,
            &mut full_response, &mut source_documents, &mut used_tools, &mut metadata_val,
        );
    }

    let result = QuestionResult {
        question_index, question: question.clone(), full_response: full_response.clone(),
        timestamp, success: true, error: None,
        source_documents: source_documents.take(), used_tools: used_tools.take(), metadata: metadata_val.take(),
    };
    log::info!(
        "[HTTP][question #{}] SSE completed, response: {}",
        question_index + 1,
        text_for_log(&result.full_response, 4000)
    );
    let _ = app.emit("question-complete", &result);
    Ok(result)
}

#[tauri::command]
pub async fn send_questions_batch(
    app: AppHandle, api_url: String, questions: Vec<String>,
    chat_id: String, streaming: bool,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<Vec<QuestionResult>, String> {
    log::info!(
        "[HTTP][batch] starting {} question(s), streaming={}",
        questions.len(),
        streaming
    );
    let mut results = Vec::new();
    for (index, question) in questions.iter().enumerate() {
        let result = send_question(
            app.clone(), api_url.clone(), question.clone(),
            chat_id.clone(), streaming, index, headers.clone(),
        ).await;
        match result {
            Ok(r) => results.push(r),
            Err(e) => { results.push(QuestionResult {
                question_index: index, question: question.clone(), full_response: String::new(),
                timestamp: chrono::Utc::now().to_rfc3339(), success: false, error: Some(e),
                source_documents: None, used_tools: None, metadata: None,
            }); }
        }
    }
    let success_count = results.iter().filter(|result| result.success).count();
    log::info!(
        "[HTTP][batch] completed: total={}, success={}, failed={}",
        results.len(),
        success_count,
        results.len() - success_count
    );
    let _ = app.emit("batch-complete", &results);
    Ok(results)
}

#[tauri::command]
pub async fn stop_batch(app: AppHandle) -> Result<(), String> {
    let _ = app.emit("batch-stop", ());
    Ok(())
}

#[tauri::command]
pub async fn save_excel_file(
    app: AppHandle,
    file_name: String,
    data: Vec<u8>,
) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("保存 Excel 文件")
        .set_file_name(file_name)
        .add_filter("Excel 工作簿", &["xlsx"])
        .save_file(move |selected_path| {
            let _ = sender.send(selected_path);
        });

    let Some(selected_path) = receiver
        .await
        .map_err(|error| format!("Open save dialog failed: {}", error))?
    else {
        return Ok(None);
    };
    let path = selected_path
        .into_path()
        .map_err(|error| format!("Invalid save path: {}", error))?;

    tokio::fs::write(&path, data)
        .await
        .map_err(|error| format!("Write Excel file failed: {}", error))?;
    log::info!("[EXPORT] Excel file saved to {}", path.display());
    Ok(Some(path.to_string_lossy().into_owned()))
}

// ═══════════════════════════════════════════════════════════════════════════
// SSE Processing
// ═══════════════════════════════════════════════════════════════════════════

fn process_sse_event(
    app: &AppHandle, question_index: usize, question: &str,
    sse_event_type: &str, data: &str,
    full_response: &mut String,
    source_documents: &mut Option<serde_json::Value>,
    used_tools: &mut Option<serde_json::Value>,
    metadata_val: &mut Option<serde_json::Value>,
) {
    let data = data.trim();

    // ─── Strip common SSE prefixes that Flowise might prepend ───
    let cleaned = data
        .strip_prefix("message ")
        .or_else(|| data.strip_prefix("message\t"))
        .or_else(|| data.strip_prefix("data "))
        .or_else(|| data.strip_prefix("event "))
        .unwrap_or(data)
        .trim();

    // ─── Flowise uses embedded JSON events: {"event":"token","data":"..."} ───
    // The SSE event type might be "message" or empty, but the REAL event type
    // is inside the JSON payload's "event" field.
    let json_data = if cleaned.starts_with('{') { cleaned } else { data };
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_data) {
        if let Some(inner_event) = json.get("event").and_then(|v| v.as_str()) {
            // This is a Flowise-style embedded event
            let inner_data = json.get("data");
            handle_flowise_event(
                app, question_index, question, inner_event, inner_data,
                full_response, source_documents, used_tools, metadata_val,
            );
            return;
        }
    }
    // Also try the original data in case stripping made it worse
    if json_data != data {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
            if let Some(inner_event) = json.get("event").and_then(|v| v.as_str()) {
                let inner_data = json.get("data");
                handle_flowise_event(
                    app, question_index, question, inner_event, inner_data,
                    full_response, source_documents, used_tools, metadata_val,
                );
                return;
            }
        }
    }

    // ─── Standard SSE: event type is in the SSE `event:` field ───
    match sse_event_type {
        "token" | "message" => {
            if let Some(content) = extract_token_content(data) {
                full_response.push_str(&content);
                let event = StreamEvent { question_index, question: question.to_string(), chunk: content, done: false };
                let _ = app.emit("stream-chunk", &event);
            }
        }
        "end" => {
            let event = StreamEvent { question_index, question: question.to_string(), chunk: String::new(), done: true };
            let _ = app.emit("stream-chunk", &event);
        }
        "metadata" => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                *metadata_val = Some(json.clone());
                let extra = FlowiseExtraEvent { question_index, event_type: "metadata".to_string(), data: json };
                let _ = app.emit("flowise-extra", &extra);
            }
        }
        "sourceDocuments" => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                *source_documents = Some(json.clone());
                let extra = FlowiseExtraEvent { question_index, event_type: "sourceDocuments".to_string(), data: json };
                let _ = app.emit("flowise-extra", &extra);
            }
        }
        "usedTools" => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                *used_tools = Some(json.clone());
                let extra = FlowiseExtraEvent { question_index, event_type: "usedTools".to_string(), data: json };
                let _ = app.emit("flowise-extra", &extra);
            }
        }
        "start" => {}
        "error" => { log::warn!("SSE error event: {}", data); }
        _ => {
            // No event type — try to extract content or handle [DONE]
            if data == "[DONE]" {
                let event = StreamEvent { question_index, question: question.to_string(), chunk: String::new(), done: true };
                let _ = app.emit("stream-chunk", &event);
            } else if !data.is_empty() {
                if let Some(content) = extract_token_content(data) {
                    full_response.push_str(&content);
                    let event = StreamEvent { question_index, question: question.to_string(), chunk: content, done: false };
                    let _ = app.emit("stream-chunk", &event);
                }
            }
        }
    }
}

/// Handle Flowise-style embedded JSON events: {"event":"token","data":"..."}
fn handle_flowise_event(
    app: &AppHandle, question_index: usize, question: &str,
    event_name: &str, inner_data: Option<&serde_json::Value>,
    full_response: &mut String,
    source_documents: &mut Option<serde_json::Value>,
    used_tools: &mut Option<serde_json::Value>,
    metadata_val: &mut Option<serde_json::Value>,
) {
    match event_name {
        "token" => {
            // inner_data can be a string (the token text) or a JSON value
            let content = match inner_data {
                Some(serde_json::Value::String(s)) => Some(s.clone()),
                Some(serde_json::Value::Number(n)) => Some(n.to_string()),
                Some(serde_json::Value::Bool(b)) => Some(b.to_string()),
                Some(v) if !v.is_null() => Some(v.to_string()),
                _ => None,
            };
            if let Some(content) = content {
                if !content.is_empty() {
                    full_response.push_str(&content);
                    let event = StreamEvent { question_index, question: question.to_string(), chunk: content, done: false };
                    let _ = app.emit("stream-chunk", &event);
                }
            }
        }
        "end" => {
            let event = StreamEvent { question_index, question: question.to_string(), chunk: String::new(), done: true };
            let _ = app.emit("stream-chunk", &event);
        }
        "metadata" => {
            if let Some(data) = inner_data.cloned() {
                *metadata_val = Some(data.clone());
                let extra = FlowiseExtraEvent { question_index, event_type: "metadata".to_string(), data };
                let _ = app.emit("flowise-extra", &extra);
            }
        }
        "sourceDocuments" => {
            if let Some(data) = inner_data.cloned() {
                *source_documents = Some(data.clone());
                let extra = FlowiseExtraEvent { question_index, event_type: "sourceDocuments".to_string(), data };
                let _ = app.emit("flowise-extra", &extra);
            }
        }
        "usedTools" => {
            if let Some(data) = inner_data.cloned() {
                *used_tools = Some(data.clone());
                let extra = FlowiseExtraEvent { question_index, event_type: "usedTools".to_string(), data };
                let _ = app.emit("flowise-extra", &extra);
            }
        }
        "start" => { /* just a signal */ }
        "error" => {
            let err_msg = inner_data.and_then(|v| v.as_str()).unwrap_or("unknown error");
            log::warn!("Flowise error event: {}", err_msg);
        }
        _ => {
            log::debug!("Unknown Flowise event: {} data: {:?}", event_name, inner_data);
        }
    }
}

/// Extract actual token text from an SSE data payload.
fn extract_token_content(data: &str) -> Option<String> {
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" || data == "message" || data == "error" || data == "end" || data == "start" {
        return None;
    }

    // Skip if this looks like a raw SSE event structure (not actual content)
    if data.contains("{\"event\"") || data.contains("\"event\":") {
        // This is a Flowise event JSON that should have been handled by process_sse_event
        // Don't display it as raw text
        return None;
    }

    // Try JSON parsing
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
        // Flowise metadata — skip
        if json.get("chatMessageId").is_some() || json.get("memoryType").is_some()
            || (json.get("chatId").is_some() && json.get("question").is_some() && json.get("sessionId").is_some())
        {
            return None;
        }
        // Flowise embedded event: {"event":"token","data":"..."} — should be handled elsewhere
        if json.get("event").is_some() {
            return None;
        }
        // {"token": "xxx"}
        if let Some(token) = json.get("token").and_then(|t| t.as_str()) {
            return Some(token.to_string());
        }
        // OpenAI format
        if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
            if let Some(first) = choices.first() {
                if let Some(content) = first.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                    return Some(content.to_string());
                }
            }
        }
        // Generic keys
        for key in &["text", "content", "answer", "response", "output"] {
            if let Some(val) = json.get(*key).and_then(|v| v.as_str()) {
                if !val.is_empty() { return Some(val.to_string()); }
            }
        }
        // String value
        if json.is_string() {
            let s = json.as_str().unwrap_or("");
            if !s.is_empty() { return Some(s.to_string()); }
        }
        // Unknown JSON — skip
        return None;
    }

    // Skip if data looks like SSE event metadata (message {"event":...})
    if data.starts_with("message ") || data.starts_with("message\t") {
        return None;
    }

    // Plain text token
    Some(data.to_string())
}

fn split_sse_field(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.starts_with(':') { return None; }
    let colon_pos = line.find(':')?;
    let field = &line[..colon_pos];
    let value = line[colon_pos + 1..].trim_start();
    Some((field, value))
}

fn parse_non_stream_response(text: &str) -> (String, Option<serde_json::Value>, Option<serde_json::Value>, Option<serde_json::Value>) {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
        let mut response_text = String::new();
        for key in &["text", "content", "answer", "response", "output"] {
            if let Some(val) = json.get(*key).and_then(|v| v.as_str()) {
                if !val.is_empty() { response_text = val.to_string(); break; }
            }
        }
        if response_text.is_empty() && json.is_string() {
            response_text = json.as_str().unwrap_or(text).to_string();
        }
        let sd = json.get("sourceDocuments").cloned();
        let ut = json.get("usedTools").cloned();
        let md = if json.get("chatId").is_some() || json.get("chatMessageId").is_some() {
            Some(serde_json::json!({
                "chatId": json.get("chatId"),
                "chatMessageId": json.get("chatMessageId"),
                "sessionId": json.get("sessionId"),
                "memoryType": json.get("memoryType"),
                "question": json.get("question"),
            }))
        } else { None };
        return (response_text, sd, ut, md);
    }
    (text.to_string(), None, None, None)
}
