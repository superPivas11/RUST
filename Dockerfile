# Используем последнюю версию Rust
FROM rust:1.82 as builder

WORKDIR /app

# Копируем файлы проекта
COPY Cargo.toml ./
COPY src ./src

# Собираем приложение
RUN cargo build --release

# Финальный образ
FROM debian:bookworm-slim

# Устанавливаем необходимые библиотеки
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем скомпилированный бинарник
COPY --from=builder /app/target/release/voice-assistant .

# Делаем исполняемым
RUN chmod +x voice-assistant

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["./voice-assistant"]