# NeurDL Universal Protocol Framework: Rust Architecture

This document outlines the plugin-based architecture for NeurDL's core download engine, enabling seamless integration of multiple protocols through a unified Trait-based system.

## 1. The `DownloadStrategy` Trait

In `src-tauri/src/download/mod.rs`, we define the core interface that every protocol handler must implement.

```rust
use async_trait::async_trait;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub filename: String,
    pub size: u64,
    pub mime_type: String,
    pub supports_resuming: bool,
}

#[async_trait]
pub trait DownloadStrategy: Send + Sync {
    /// Initial connection and handshake
    async fn connect(&self, url: &str) -> Result<(), String>;

    /// Fetch file metadata (size, name, etc.)
    async fn fetch_metadata(&self) -> Result<Metadata, String>;

    /// Download a specific chunk (byte range)
    async fn download_chunk(&self, start: u64, end: u64) -> Result<Vec<u8>, String>;

    /// Protocol-specific cleanup
    async fn close(&self) -> Result<(), String>;
}
```

## 2. Protocol Integration (`Cargo.toml`)

Add these to your `src-tauri/Cargo.toml` to support the full suite of protocols:

```toml
[dependencies]
# Core Async
tokio = { version = "1", features = ["full"] }
async-trait = "0.1"

# WebDAV
webdav-handler = "0.2"

# M3U8 (HLS)
m3u8-rs = "5.0"

# IPFS
rust-ipfs-api = "0.11"

# SFTP (SSH)
ssh2 = "0.9"

# Magnet / BitTorrent
librust-torrent = "0.1"

# AI Routing (Regex + Heuristics)
regex = "1.10"
```

## 3. AI-Driven Protocol Router

The `ProtocolRouter` uses AI-inspired heuristics to dispatch URLs to the correct implementation.

```rust
pub struct ProtocolRouter;

impl ProtocolRouter {
    pub fn get_strategy(url: &str) -> Box<dyn DownloadStrategy> {
        if url.starts_with("magnet:?") {
            Box::new(BitTorrentStrategy::new())
        } else if url.ends_with(".m3u8") {
            Box::new(HlsStrategy::new())
        } else if url.starts_with("ipfs://") || url.contains("/ipfs/") {
            Box::new(IpfsStrategy::new())
        } else if url.starts_with("sftp://") {
            Box::new(SftpStrategy::new())
        } else if url.contains("webdav") {
            Box::new(WebDavStrategy::new())
        } else {
            Box::new(HttpStrategy::new())
        }
    }
}
```

## 4. Unified Asynchronous Segmented Downloader

Regardless of the protocol, the `Downloader` treats everything as a series of chunks.

```rust
pub struct SegmentedDownloader {
    strategy: Box<dyn DownloadStrategy>,
}

impl SegmentedDownloader {
    pub async fn start_download(&self, url: &str, threads: usize) {
        let metadata = self.strategy.fetch_metadata().await.unwrap();
        let chunk_size = metadata.size / threads as u64;

        let mut handles = vec![];
        for i in 0..threads {
            let start = i as u64 * chunk_size;
            let end = if i == threads - 1 { metadata.size } else { (i as u64 + 1) * chunk_size };
            
            // Each thread calls the same download_chunk method
            let strategy = self.strategy.clone(); // Requires Arc
            handles.push(tokio::spawn(async move {
                strategy.download_chunk(start, end).await
            }));
        }
        
        // Join and merge buffers...
    }
}
```

## Advantages of this Architecture
1. **Extensibility**: Adding a new protocol (e.g., `av://` or `ftp://`) only requires implementing the `DownloadStrategy` trait.
2. **Unified UI**: The frontend only needs to know about progress and speed, as the backend abstracts away the protocol complexity.
3. **AI Optimization**: The router can be enhanced with a local LLM to predict the best protocol for ambiguous links (e.g., choosing between HTTP and IPFS for the same content).
