# NeurDL External Engine Integration: Aria2c & yt-dlp

This document explains how to integrate `aria2c` and `yt-dlp` as high-performance backup engines for NeurDL using Rust's `std::process::Command`.

## 1. The `ExternalEngine` Trait

In `src-tauri/src/download/external.rs`, we define a wrapper for external binaries.

```rust
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use async_trait::async_trait;

#[async_trait]
pub trait ExternalEngine: Send + Sync {
    fn get_binary_name(&self) -> &str;
    fn build_args(&self, url: &str, options: &DownloadOptions) -> Vec<String>;
    
    async fn spawn_and_monitor(&self, url: &str, options: DownloadOptions) -> Result<(), String> {
        let mut child = Command::new(self.get_binary_name())
            .args(self.build_args(url, &options))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start engine: {}", e))?;

        let stdout = child.stdout.take().unwrap();
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            let line = line.unwrap();
            // 1. Parse progress from logs
            // 2. Send logs to AI for parameter optimization
            self.report_to_ai(&line).await;
        }

        Ok(())
    }

    async fn report_to_ai(&self, log_line: &str);
}
```

## 2. Aria2c Implementation

Aria2c is used for multi-connection HTTP/FTP and BitTorrent.

```rust
pub struct Aria2Strategy;

impl ExternalEngine for Aria2Strategy {
    fn get_binary_name(&self) -> &str { "aria2c" }
    
    fn build_args(&self, url: &str, options: &DownloadOptions) -> Vec<String> {
        vec![
            url.to_string(),
            format!("--max-connection-per-server={}", options.max_connections),
            format!("--split={}", options.threads),
            "--min-split-size=1M".to_string(),
            "--summary-interval=1".to_string(),
            "--quiet=false".to_string(),
        ]
    }
}
```

## 3. yt-dlp Implementation

Used for YouTube, Bilibili, and other complex streaming sites.

```rust
pub struct YtDlpStrategy;

impl ExternalEngine for YtDlpStrategy {
    fn get_binary_name(&self) -> &str { "yt-dlp" }
    
    fn build_args(&self, url: &str, _options: &DownloadOptions) -> Vec<String> {
        vec![
            url.to_string(),
            "--newline".to_string(),
            "--progress".to_string(),
            "-f".to_string(), "bestvideo+bestaudio/best".to_string(),
            "--merge-output-format".to_string(), "mp4".to_string(),
        ]
    }
}
```

## 4. AI-Driven Parameter Tuning

The AI monitors the logs (e.g., "Connection refused", "Speed dropping") and suggests new parameters.

```rust
// AI Logic (Pseudo-code)
async fn optimize_parameters(logs: Vec<String>) -> DownloadOptions {
    let ai_suggestion = call_gemini_api(logs).await;
    // If AI sees "Slow speed", it might increase --max-connection-per-server
    // If AI sees "403 Forbidden", it might suggest rotating User-Agent
    ai_suggestion
}
```

## Advantages
1. **Speed**: Aria2c is battle-tested for multi-threaded downloads.
2. **Compatibility**: yt-dlp supports 1000+ sites that standard HTTP clients can't handle.
3. **Intelligence**: NeurDL doesn't just run these tools; it *optimizes* them in real-time based on network conditions.
