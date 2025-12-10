# Используем самую последнюю версию Rust
FROM rust:latest as builder

WORKDIR /app

# Копируем файлы проекта
COPY Cargo.toml ./
COPY src ./src
COPY static ./static

# Собираем приложение
RUN cargo build --release

# Финальный образ
FROM debian:bookworm-slim

# Устанавливаем необходимые библиотеки
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем скомпилированный бинарник и статические файлы
COPY --from=builder /app/target/release/voice-assistant .
COPY --from=builder /app/static ./static

# Делаем исполняемым
RUN chmod +x voice-assistant

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["./voice-assistant"]