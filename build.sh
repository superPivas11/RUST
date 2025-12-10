#!/bin/bash
# Скрипт сборки для Render.com

echo "Building Rust voice assistant..."
cargo build --release

echo "Build completed successfully!"
echo "Binary location: ./target/release/voice-assistant"