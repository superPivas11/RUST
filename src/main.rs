use axum::{
    extract::{ws::WebSocket, WebSocketUpgrade},
    response::{IntoResponse, Json},
    routing::{get, any},
    Router,
};
use serde::Serialize;
use std::{env, net::SocketAddr};
use tower_http::cors::CorsLayer;
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
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .unwrap_or(8080);

    let app = Router::new()
        .route("/", get(root))
        .route("/ws", any(websocket_handler))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Сервер запущен на http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn root() -> impl IntoResponse {
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

    let groq_api_key = env::var("GROQ_API_KEY")
        .unwrap_or_else(|_| "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".to_string());
    
    let groq_client = GroqClient::new(groq_api_key);
    let mut all_data = Vec::new();

    // Получаем аудио данные
    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(axum::extract::ws::Message::Binary(data)) => {
                if data.windows(10).any(|window| window == b"END_STREAM") {
                    // Удаляем маркер END_STREAM и добавляем оставшиеся данные
                    let data_str = String::from_utf8_lossy(&data);
                    let clean_str = data_str.replace("END_STREAM", "");
                    all_data.extend_from_slice(clean_str.as_bytes());
                    break;
                }
                all_data.extend_from_slice(&data);
            }
            Ok(axum::extract::ws::Message::Close(_)) => break,
            Err(e) => {
                error!("Ошибка WebSocket: {}", e);
                break;
            }
            _ => {}
        }
    }

    info!("Получено {} байт аудио", all_data.len());

    // Обработка аудио
    match process_audio(&groq_client, all_data).await {
        Ok(response) => {
            info!("Ответ: {}", response);
            if let Err(e) = socket.send(axum::extract::ws::Message::Text(response)).await {
                error!("Ошибка отправки ответа: {}", e);
            }
        }
        Err(e) => {
            error!("Ошибка обработки: {}", e);
            let _ = socket.send(axum::extract::ws::Message::Text("Error".to_string())).await;
        }
    }
}

async fn process_audio(groq_client: &GroqClient, audio_data: Vec<u8>) -> anyhow::Result<String> {
    // Создаем временный файл
    let temp_file = tempfile::NamedTempFile::with_suffix(".wav")?;
    let temp_path = temp_file.path();

    // Сохраняем как WAV
    save_raw_as_wav(&audio_data, temp_path)?;

    // Распознавание речи
    let text = groq_client.transcribe_audio(temp_path).await?;
    info!("Распознано: {}", text);

    // Получаем ответ от AI
    let answer = groq_client.get_chat_response(&text).await?;
    
    Ok(answer)

}
