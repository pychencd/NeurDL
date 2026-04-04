import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cors from "cors";
import magnet from "magnet-uri";
import { Parser } from "m3u8-parser";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API: Get file info (size, type, etc.) with multi-protocol support
  app.post("/api/file-info", async (req, res) => {
    const { url, protocol: providedProtocol } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      let protocol = providedProtocol;

      // Manual detection fallback if no protocol provided
      if (!protocol) {
        if (url.startsWith("magnet:")) protocol = "magnet";
        else if (url.startsWith("ipfs://") || url.includes("/ipfs/")) protocol = "ipfs";
        else if (url.startsWith("sftp://") || url.startsWith("ftp://")) protocol = url.split("://")[0];
        else if (url.includes("webdav") || url.startsWith("dav://") || url.startsWith("davs://")) protocol = "webdav";
        else if (url.endsWith(".m3u8") || url.includes(".m3u8?")) protocol = "hls";
        else if (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("bilibili.com") || url.includes("vimeo.com")) protocol = "yt-dlp";
        else protocol = "http";
      }

      const getFilenameFromUrl = (urlStr: string, fallback: string) => {
        try {
          const urlObj = new URL(urlStr);
          const filename = path.basename(urlObj.pathname);
          return filename ? decodeURIComponent(filename) : fallback;
        } catch (e) {
          try {
            return decodeURIComponent(path.basename(urlStr.split('?')[0])) || fallback;
          } catch (e2) {
            return fallback;
          }
        }
      };

      // 1. Magnet Link Detection
      if (protocol === "magnet" || url.startsWith("magnet:")) {
        const decode = (magnet as any).decode || magnet;
        const parsed = decode(url);
        return res.json({
          protocol: "magnet",
          filename: parsed.name || "Magnet Download",
          infoHash: parsed.infoHash,
          size: 0,
          type: "application/x-bittorrent",
          supportsResuming: true,
          description: "Decentralized P2P download via DHT/PEX."
        });
      }

      // 2. IPFS Detection
      if (protocol === "ipfs" || url.startsWith("ipfs://") || url.includes("/ipfs/")) {
        const cid = url.split("/ipfs/")[1] || url.replace("ipfs://", "");
        return res.json({
          protocol: "ipfs",
          filename: `IPFS Content (${cid.substring(0, 8)}...)`,
          size: 0,
          type: "application/ipfs",
          supportsResuming: true,
          description: "InterPlanetary File System (IPFS) content. Distributed and immutable."
        });
      }

      // 3. SFTP / FTP Detection
      if (protocol === "sftp" || protocol === "ftp" || url.startsWith("sftp://") || url.startsWith("ftp://")) {
        const detectedProtocol = url.split("://")[0] || protocol;
        return res.json({
          protocol: detectedProtocol,
          filename: getFilenameFromUrl(url, "Remote File"),
          size: 0,
          type: "application/octet-stream",
          supportsResuming: true,
          description: `Secure remote file transfer via ${detectedProtocol.toUpperCase()}.`
        });
      }

      // 4. WebDAV Detection
      if (protocol === "webdav" || url.includes("webdav") || url.startsWith("dav://") || url.startsWith("davs://")) {
        return res.json({
          protocol: "webdav",
          filename: getFilenameFromUrl(url, "WebDAV Resource"),
          size: 0,
          type: "application/webdav",
          supportsResuming: true,
          description: "Web Distributed Authoring and Versioning (WebDAV) resource."
        });
      }

      // 5. HLS (M3U8) Detection
      if (protocol === "hls" || url.endsWith(".m3u8") || url.includes(".m3u8?")) {
        return res.json({
          protocol: "hls",
          filename: getFilenameFromUrl(url, "Stream.m3u8"),
          size: 0,
          type: "application/x-mpegURL",
          supportsResuming: true,
          description: "Streaming HLS playlist (M3U8). Will be merged into a single video file."
        });
      }

      // 6. YouTube / Complex Video Detection (yt-dlp)
      if (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("bilibili.com") || url.includes("vimeo.com")) {
        return res.json({
          protocol: "yt-dlp",
          filename: "Video Content",
          size: 0,
          type: "video/mp4",
          supportsResuming: true,
          description: "Complex video resource detected. Routing to yt-dlp engine for extraction and merging."
        });
      }

      // 7. HTTP/HTTPS (Standard + HLS check)
      const response = await axios.head(url, {
        headers: { "User-Agent": "NeurDL/1.0" },
        timeout: 5000
      }).catch(() => null);

      if (response) {
        const contentType = response.headers["content-type"] || "";
        const contentDisposition = response.headers["content-disposition"] || "";
        let filename = "";

        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\n]+)['"]?/i);
          if (filenameMatch && filenameMatch[1]) {
            filename = decodeURIComponent(filenameMatch[1]);
          }
        }

        if (!filename) {
          filename = getFilenameFromUrl(url, "download");
        }

        if (!filename || filename === "/") filename = "download";

        const isHLS = contentType.includes("application/x-mpegURL") || url.endsWith(".m3u8");

        return res.json({
          protocol: isHLS ? "hls" : "http",
          size: parseInt(response.headers["content-length"] || "0"),
          type: contentType,
          supportsResuming: response.headers["accept-ranges"] === "bytes",
          filename,
          description: isHLS ? "Streaming HLS playlist (M3U8). Will be merged into a single video." : "Standard HTTP/HTTPS download."
        });
      }

      // Fallback for unknown HTTP links (e.g. HEAD not supported)
      res.json({
        protocol: "http",
        filename: getFilenameFromUrl(url, "download"),
        size: 0,
        type: "unknown",
        supportsResuming: false,
        description: "Standard HTTP download (Metadata unavailable)."
      });

    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NeurDL Server running on http://localhost:${PORT}`);
  });
}

startServer();
