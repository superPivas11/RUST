use anyhow::Result;
use hound::{WavSpec, WavWriter};
use std::path::Path;

pub fn save_raw_as_wav(raw_data: &[u8], filename: &Path) -> Result<()> {
    let spec = WavSpec {
        channels: 1,           // моно
        sample_rate: 16000,    // 16kHz
        bits_per_sample: 16,   // 16 бит
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(filename, spec)?;

    // Конвертируем байты в i16 samples
    for chunk in raw_data.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
        writer.write_sample(sample)?;
    }

    writer.finalize()?;
    Ok(())
}
