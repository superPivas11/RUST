#!/bin/bash
echo "Starting voice assistant..."
ls -la target/release/
if [ -f "target/release/voice-assistant" ]; then
    echo "Found binary, starting..."
    ./target/release/voice-assistant
else
    echo "Binary not found, using cargo run..."
    cargo run --release
fi