use reqwest::{multipart, Client};
use serde::{Deserialize, Serialize};
use std::path::Path;
use anyhow::{anyhow, Result};

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct TranscriptionResponse {
    text: String,
}

pub struct GroqClient {
    client: Client,
    api_key: String,
}

impl GroqClient {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }

    pub async fn get_chat_response(&self, text: &str) -> Result<String> {
        let request = ChatRequest {
            model: "openai/gpt-oss-120b".to_string(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "Ты голосовой ассистент. Отвечай по возможности кратко, не более 4-5 предложений. Отвечай на русском языке.".to_string(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: text.to_string(),
                },
            ],
        };

        self.send_chat_request(request).await
    }

    pub async fn get_chat_response_with_context(
        &self, 
        text: &str, 
        conversation_history: &[(String, String)]
    ) -> Result<String> {
        let mut messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: "Ты голосовой ассистент. Отвечай кратко, не более 4-5 предложений. Отвечай на русском языке. Помни контекст предыдущих сообщений в разговоре и отвечай с учетом истории.".to_string(),
            }
        ];

        // Добавляем историю разговора (только последние 10 сообщений для экономии токенов)
        let recent_history = if conversation_history.len() > 5 {
            &conversation_history[conversation_history.len() - 5..]
        } else {
            conversation_history
        };

        for (user_msg, assistant_msg) in recent_history {
            messages.push(ChatMessage {
                role: "user".to_string(),
                content: user_msg.clone(),
            });
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: assistant_msg.clone(),
            });
        }

        // Добавляем текущий вопрос
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: text.to_string(),
        });

        let request = ChatRequest {
            model: "openai/gpt-oss-120b".to_string(),
            messages,
        };

        self.send_chat_request(request).await
    }

    async fn send_chat_request(&self, request: ChatRequest) -> Result<String> {
        let response = self
            .client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Groq API error: {}", error_text));
        }

        let chat_response: ChatResponse = response.json().await?;
        
        chat_response
            .choices
            .first()
            .map(|choice| choice.message.content.clone())
            .ok_or_else(|| anyhow!("No response from Groq"))
    }

    pub async fn transcribe_audio(&self, audio_path: &Path) -> Result<String> {
        let file_bytes = tokio::fs::read(audio_path).await?;
        
        let form = multipart::Form::new()
            .text("model", "whisper-large-v3")
            .text("language", "ru")
            .part(
                "file",
                multipart::Part::bytes(file_bytes)
                    .file_name("audio.wav")
                    .mime_str("audio/wav")?,
            );

        let response = self
            .client
            .post("https://api.groq.com/openai/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Groq transcription error: {}", error_text));
        }

        let transcription: TranscriptionResponse = response.json().await?;
        Ok(transcription.text)
    }
}
