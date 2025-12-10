use axum::{
    extract::{ws::WebSocket, WebSocketUpgrade},
    response::{IntoResponse, Json, Html},
    routing::{get, any},
    Router,
};
use serde::Serialize;
use std::{env, net::SocketAddr};
use tower_http::{cors::CorsLayer, services::ServeDir};
use tracing::{error, info};

mod groq;
mod audio;

use groq::GroqClient;
use audio::save_raw_as_wav;

#[derive(Serialize)]
struct StatusResponse {
    status: String,
    message: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Инициализация логирования
    tracing_subscriber::fmt::init();

    let port = env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse::<u16>()
        .unwrap_or(3000);
    
    info!("Используется порт: {}", port);
    info!("PORT env var: {:?}", env::var("PORT"));

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/api/status", get(api_status))
        .route("/ws", any(websocket_handler))
        .nest_service("/static", ServeDir::new("static"))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Сервер запущен на http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn serve_index() -> impl IntoResponse {
    Html(include_str!("../static/index.html"))
}

async fn api_status() -> impl IntoResponse {
    Json(StatusResponse {
        status: "ok".to_string(),
        message: "Voice Assistant Server".to_string(),
    })
}

async fn websocket_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_websocket)
}

async fn handle_websocket(mut socket: WebSocket) {
    info!("Клиент подключен");
    
    // Проверяем переменные окружения
    info!("GROQ_API_KEY установлен: {}", env::var("GROQ_API_KEY").is_ok());

    let groq_api_key = env::var("GROQ_API_KEY")
        .unwrap_or_else(|_| "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".to_string());
    
    let groq_client = GroqClient::new(groq_api_key);
    
    // История разговора для этого соединения
    let mut conversation_history: Vec<(String, String)> = Vec::new();

    // Основной цикл обработки сообщений
    loop {
        let mut all_data = Vec::new();
        let mut recording = false;

        // Получаем аудио данные до END_STREAM
        while let Some(msg) = socket.recv().await {
            match msg {
                Ok(axum::extract::ws::Message::Binary(data)) => {
                    recording = true;
                    // Проверяем на END_STREAM маркер
                    if let Some(pos) = data.windows(10).position(|window| window == b"END_STREAM") {
                        // Добавляем данные до маркера
                        all_data.extend_from_slice(&data[..pos]);
                        break; // Выходим из внутреннего цикла для обработки
                    }
                    all_data.extend_from_slice(&data);
                }
                Ok(axum::extract::ws::Message::Text(text)) => {
                    if text == "ping" {
                        // Отвечаем на ping для поддержания соединения
                        if let Err(e) = socket.send(axum::extract::ws::Message::Text("pong".into())).await {
                            error!("Ошибка отправки pong: {}", e);
                            return;
                        }
                    } else if text == "clear_context" {
                        // Очищаем контекст разговора
                        conversation_history.clear();
                        info!("Контекст разговора очищен");
                        if let Err(e) = socket.send(axum::extract::ws::Message::Text("Контекст очищен! Начинаем новый разговор.".into())).await {
                            error!("Ошибка отправки подтверждения: {}", e);
                            return;
                        }
                    }
                }
                Ok(axum::extract::ws::Message::Close(_)) => {
                    info!("Клиент отключился");
                    return;
                }
                Err(e) => {
                    error!("Ошибка WebSocket: {}", e);
                    return;
                }
                _ => {}
            }
        }

        // Если получили данные, обрабатываем их
        if recording && !all_data.is_empty() {
            info!("Получено {} байт аудио", all_data.len());

            match process_audio_with_context(&groq_client, all_data, &mut conversation_history).await {
                Ok(response) => {
                    info!("Ответ: {}", response);
                    if let Err(e) = socket.send(axum::extract::ws::Message::Text(response.into())).await {
                        error!("Ошибка отправки ответа: {}", e);
                        return;
                    }
                }
                Err(e) => {
                    error!("Ошибка обработки: {}", e);
                    let error_msg = format!("Ошибка: {}", e);
                    if let Err(e) = socket.send(axum::extract::ws::Message::Text(error_msg.into())).await {
                        error!("Ошибка отправки ошибки: {}", e);
                        return;
                    }
                }
            }
        } else if recording {
            // Если была запись, но данных нет
            let _ = socket.send(axum::extract::ws::Message::Text("Нет аудио данных".to_string().into())).await;
        }
    }
}

async fn process_audio_with_context(
    groq_client: &GroqClient, 
    audio_data: Vec<u8>, 
    conversation_history: &mut Vec<(String, String)>
) -> anyhow::Result<String> {
    // Создаем временный файл
    let temp_file = tempfile::NamedTempFile::with_suffix(".wav")?;
    let temp_path = temp_file.path();

    // Сохраняем как WAV
    save_raw_as_wav(&audio_data, temp_path)?;

    // Распознавание речи
    let text = groq_client.transcribe_audio(temp_path).await?;
    info!("Распознано: {}", text);

    // Получаем ответ от AI с контекстом
    let answer = groq_client.get_chat_response_with_context(&text, conversation_history).await?;
    
    // Добавляем в историю разговора
    conversation_history.push((text.clone(), answer.clone()));
    
    // Ограничиваем историю последними 10 сообщениями для экономии памяти
    if conversation_history.len() > 10 {
        conversation_history.remove(0);
    }
    
    info!("История разговора: {} сообщений", conversation_history.len());
    
    Ok(answer)
}
