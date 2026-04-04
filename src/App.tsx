/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, Component } from 'react';
import { 
  Download, 
  Plus, 
  Search, 
  Settings, 
  History, 
  Zap, 
  ShieldCheck, 
  Cpu, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Music, 
  MoreVertical,
  Pause,
  Play,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Terminal,
  Command,
  Activity,
  Box,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  HardDrive,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Shield,
  Cloud,
  Globe,
  Folder,
  Upload,
  File,
  LogIn,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  handleFirestoreError, 
  OperationType,
  FirebaseUser
} from './firebase';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

// Error Boundary Component
class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        errorMessage = `Firestore Error: ${parsed.error} (Op: ${parsed.operationType})`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/50 p-6 rounded-xl max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Application Error</h2>
            <p className="text-zinc-400 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  size: number;
  progress: number;
  status: 'downloading' | 'paused' | 'completed' | 'error';
  speed: string;
  type: string;
  protocol: string;
  description?: string;
  addedAt: number;
  chunks: boolean[]; // Representing downloaded segments
  speedHistory: { time: string; speed: number }[];
  trackers?: { url: string; status: string; seeds: number; leeches: number }[];
  peers?: { ip: string; speed: string; health: number }[];
}

export default function App() {
  return (
    <ErrorBoundary>
      <NeurDLApp />
    </ErrorBoundary>
  );
}

function NeurDLApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<{ aiQuota: number; isPremium: boolean } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [url, setUrl] = useState('');
  const runningSimulations = useRef<Set<string>>(new Set());
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'downloading' | 'completed'>('all');
  const [globalSpeedHistory, setGlobalSpeedHistory] = useState(
    Array(20).fill(0).map((_, i) => ({ time: i, speed: 0 }))
  );

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Ensure user profile exists
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              aiQuota: 50,
              isPremium: false,
              role: 'user'
            });
            setUserProfile({ aiQuota: 50, isPremium: false });
          } else {
            setUserProfile({ 
              aiQuota: userDoc.data().aiQuota, 
              isPremium: userDoc.data().isPremium 
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync: Downloads
  useEffect(() => {
    if (!user || !isAuthReady) {
      // If not logged in, we could keep local state or clear it
      // For now, let's clear it to encourage login
      setDownloads([]);
      return;
    }

    const q = query(
      collection(db, 'users', user.uid, 'downloads'),
      orderBy('addedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const remoteDownloads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DownloadItem[];
      
      setDownloads(remoteDownloads);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/downloads`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Firestore Sync: User Profile (Quota)
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setUserProfile({ 
          aiQuota: doc.data().aiQuota, 
          isPremium: doc.data().isPremium 
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAiInsight(null);
    
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      
      if (error.code === 'auth/popup-blocked') {
        setAiInsight("Login popup was blocked by your browser. Please allow popups for this site and try again.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // This usually means another login was already in progress
        setAiInsight("A login request is already in progress. Please wait.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setAiInsight("Login was cancelled. Please try again to access your AI quota.");
      } else {
        setAiInsight(`Login failed: ${error.message || "Unknown error"}. Please try again.`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setDownloads([]);
      setSelectedTaskId(null);
      runningSimulations.current.clear();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Resume simulations for active tasks
  useEffect(() => {
    if (!user || !isAuthReady || downloads.length === 0) return;
    
    downloads.forEach(d => {
      if (d.status === 'downloading' && !runningSimulations.current.has(d.id)) {
        simulateDownload(d.id, d.protocol);
      }
    });
  }, [isAuthReady, user, downloads]); // Run when downloads are loaded
  useEffect(() => {
    const interval = setInterval(() => {
      const totalSpeed = downloads.reduce((acc, d) => {
        if (d.status === 'downloading') {
          const match = d.speed.match(/(\d+\.?\d*)/);
          return acc + (match ? parseFloat(match[1]) : 0);
        }
        return acc;
      }, 0);

      setGlobalSpeedHistory(prev => [
        ...prev.slice(1),
        { time: Date.now(), speed: totalSpeed }
      ]);
    }, 1000);
    return () => clearInterval(interval);
  }, [downloads]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [downloadPath, setDownloadPath] = useState('/Downloads/NeurDL');
  const [aiEngineEnabled, setAiEngineEnabled] = useState(true);
  const [maxConnections, setMaxConnections] = useState(32);
  const [pathHint, setPathHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [p2pOptimizer, setP2pOptimizer] = useState<{
    topTrackers: string[];
    topPeers: string[];
    insight: string;
  } | null>(null);
  const [engineOptimizer, setEngineOptimizer] = useState<any>(null);

  // AI Optimizer State
  const [optimizer, setOptimizer] = useState({
    cpu: 15,
    latency: 24,
    packetLoss: 0.1,
    threads: 8,
    bufferSize: 8,
    reasoning: "System idle. Using local optimization."
  });

  // Local Protocol Detection (Fallback for AI)
  const detectProtocol = (url: string) => {
    if (url.startsWith('magnet:')) return 'magnet';
    if (url.startsWith('torrent:')) return 'magnet';
    if (url.includes('ipfs/')) return 'ipfs';
    if (url.endsWith('.m3u8')) return 'hls';
    if (url.startsWith('sftp://')) return 'sftp';
    if (url.startsWith('ftp://')) return 'ftp';
    if (url.includes('webdav')) return 'webdav';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'yt-dlp';
    return 'http';
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false);
        else if (selectedTaskId) setSelectedTaskId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, selectedTaskId]);

  // Periodic AI Optimization (Disabled for now due to quota)
  /*
  useEffect(() => {
    const interval = setInterval(async () => {
      // ... AI logic ...
    }, 60000);
    return () => clearInterval(interval);
  }, [optimizer]);
  */

  // P2P Tracker AI Optimization (Disabled for now due to quota)
  /*
  useEffect(() => {
    // ... AI logic ...
  }, [selectedTaskId, downloads]);
  */

  // External Engine AI Log Analysis (Disabled for now due to quota)
  /*
  useEffect(() => {
    // ... AI logic ...
  }, [selectedTaskId, downloads]);
  */

  const handleAddDownload = async (inputUrl?: string) => {
    const targetUrl = inputUrl || url;
    if (!targetUrl) return;

    if (!user) {
      setAiInsight("Please login with Google to start downloading.");
      handleLogin();
      return;
    }
    
    setIsAnalyzing(true);
    setAiInsight("NeurDL AI is identifying protocol and analyzing content...");

    try {
      // 1. Local Protocol Routing (Bypassing AI for stability)
      const identifiedProtocol = detectProtocol(targetUrl);

      // 2. Fetch Metadata from Backend
      const infoRes = await fetch('/api/file-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, protocol: identifiedProtocol })
      });
      const info = await infoRes.json();

      if (info.error) throw new Error(info.error);

      // 3. AI Optimization (Only if enabled)
      let insight = "NeurDL local engine is ready to download.";
      let usedAI = false;

      if (aiEngineEnabled) {
        if (userProfile && userProfile.aiQuota > 0) {
          try {
            const model = "gemini-3-flash-preview";
            const prompt = `Analyze this download request for NeurDL and provide optimization parameters:
            URL: ${targetUrl}
            Protocol Detected: ${info.protocol}
            Filename: ${info.filename}
            Type: ${info.type}
            
            Return a JSON object with:
            - reasoning (string, 1 concise sentence)
            - threads (number, 1-64)
            - bufferSize (number, 1-32 in MB)
            - latency (number, estimated in ms)
            - packetLoss (number, estimated 0-1)`;
            
            const aiResponse = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    reasoning: { type: Type.STRING },
                    threads: { type: Type.NUMBER },
                    bufferSize: { type: Type.NUMBER },
                    latency: { type: Type.NUMBER },
                    packetLoss: { type: Type.NUMBER },
                  },
                  required: ["reasoning", "threads", "bufferSize", "latency", "packetLoss"]
                }
              }
            });
            
            const aiData = JSON.parse(aiResponse.text || "{}");
            insight = aiData.reasoning || insight;
            usedAI = true;
            
            setOptimizer({
              cpu: Math.floor(Math.random() * 20) + 10,
              latency: aiData.latency || 24,
              packetLoss: aiData.packetLoss || 0.1,
              threads: aiData.threads || 8,
              bufferSize: aiData.bufferSize || 8,
              reasoning: aiData.reasoning || "Optimized by Gemini AI."
            });

            // Deduct quota
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
              aiQuota: userProfile.aiQuota - 1
            });
          } catch (e) {
            console.warn("AI Optimization skipped due to quota or error.");
            setOptimizer(prev => ({ ...prev, reasoning: "AI Engine busy. Using local fallback." }));
          }
        } else {
          insight = "AI Quota exhausted. Using local engine.";
          setAiEngineEnabled(false);
        }
      } else {
        setOptimizer(prev => ({ ...prev, reasoning: "AI Engine disabled. Using local optimization." }));
      }
      
      setAiInsight(insight);

      const downloadId = Math.random().toString(36).substr(2, 9);
      const newDownload: any = {
        url: targetUrl,
        filename: decodeURIComponent(targetUrl.startsWith('torrent://') ? targetUrl.replace('torrent://', '') : info.filename),
        size: info.size,
        progress: 0,
        status: 'downloading',
        speed: '0 KB/s',
        type: info.type,
        protocol: info.protocol,
        description: info.description,
        addedAt: Date.now(),
        chunks: Array(100).fill(false),
        speedHistory: Array(20).fill(0).map((_, i) => ({ time: `${i}s`, speed: 0 })),
        trackers: info.protocol === 'magnet' ? [
          { url: 'udp://tracker.opentrackr.org:1337/announce', status: 'Active', seeds: 124, leeches: 42 },
          { url: 'udp://9.rarbg.com:2810/announce', status: 'Active', seeds: 89, leeches: 12 },
          { url: 'udp://tracker.coppersurfer.tk:6969/announce', status: 'Active', seeds: 210, leeches: 56 },
        ] : undefined,
        peers: info.protocol === 'magnet' ? [
          { ip: '192.168.1.45', speed: '2.4 MB/s', health: 98 },
          { ip: '45.12.89.21', speed: '1.1 MB/s', health: 85 },
          { ip: '210.4.5.12', speed: '840 KB/s', health: 72 },
          { ip: '89.23.1.4', speed: '420 KB/s', health: 45 },
        ] : undefined
      };

      // Save to Firestore
      const downloadDocRef = doc(db, 'users', user.uid, 'downloads', downloadId);
      await setDoc(downloadDocRef, newDownload);

      setUrl('');
      setSelectedTaskId(downloadId);
      
      simulateDownload(downloadId, info.protocol);

    } catch (error) {
      console.error(error);
      setAiInsight("Error: NeurDL could not resolve this link. Check protocol or network.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const simulateDownload = (id: string, protocol: string) => {
    if (!user || runningSimulations.current.has(id)) return;
    runningSimulations.current.add(id);
    let speedBase = protocol === 'magnet' ? 0.5 : 5;
    
    const interval = setInterval(async () => {
      const downloadDocRef = doc(db, 'users', user.uid, 'downloads', id);
      const docSnap = await getDoc(downloadDocRef);
      if (!docSnap.exists() || docSnap.data().status !== 'downloading') {
        clearInterval(interval);
        runningSimulations.current.delete(id);
        return;
      }

      const item = docSnap.data() as DownloadItem;
      let currentProgress = item.progress;
      let currentSize = item.size;
      
      // Simulate magnet size resolution
      if (protocol === 'magnet' && currentSize === 0 && currentProgress > 5) {
        currentSize = 1024 * 1024 * 1024 * 1.5; // 1.5 GB
      }

      if (protocol === 'magnet' && currentProgress < 50) speedBase += 0.2;
      
      const minIncrement = 0.1;
      const increment = Math.max(minIncrement, Math.random() * speedBase);
      
      let newProgress = currentProgress + increment;
      if (newProgress > 98.5) newProgress = Math.min(newProgress + 1, 100);
      else newProgress = Math.min(newProgress, 100);
      
      const newChunks = [...item.chunks];
      const chunkIndex = Math.floor((newProgress / 100) * 100);
      for (let i = 0; i <= chunkIndex; i++) {
        if (Math.random() > 0.1) newChunks[i] = true;
      }

      const currentSpeed = speedBase + Math.random() * 2;
      const newSpeedHistory = [...item.speedHistory.slice(1), { time: `${Date.now()}`, speed: currentSpeed }];
      
      if (newProgress === 100) {
        clearInterval(interval);
        runningSimulations.current.delete(id);
        await updateDoc(downloadDocRef, { 
          progress: 100, 
          status: 'completed', 
          speed: '0 KB/s', 
          size: currentSize,
          chunks: Array(100).fill(true),
          speedHistory: newSpeedHistory
        });
        return;
      }
      
      await updateDoc(downloadDocRef, { 
        progress: newProgress, 
        speed: `${currentSpeed.toFixed(1)} MB/s`,
        size: currentSize,
        chunks: newChunks,
        speedHistory: newSpeedHistory
      });
    }, 1000); // Slower update for Firestore to avoid rate limits
  };

  const toggleStatus = async (id: string) => {
    if (!user) return;
    const downloadDocRef = doc(db, 'users', user.uid, 'downloads', id);
    const docSnap = await getDoc(downloadDocRef);
    if (docSnap.exists()) {
      const item = docSnap.data();
      const newStatus = item.status === 'downloading' ? 'paused' : 'downloading';
      await updateDoc(downloadDocRef, { status: newStatus });
      if (newStatus === 'downloading') {
        simulateDownload(id, item.protocol);
      }
    }
  };

  const removeDownload = async (id: string) => {
    if (!user) return;
    const downloadDocRef = doc(db, 'users', user.uid, 'downloads', id);
    await deleteDoc(downloadDocRef);
    if (selectedTaskId === id) setSelectedTaskId(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return 'Unknown Size';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string, protocol: string, url?: string) => {
    if (url?.startsWith('torrent://')) return <File className="w-5 h-5 text-blue-400" />;
    if (protocol === 'magnet') return <Zap className="w-5 h-5 text-red-400" />;
    if (protocol === 'ipfs') return <Box className="w-5 h-5 text-purple-400" />;
    if (protocol === 'hls') return <Video className="w-5 h-5 text-orange-400" />;
    if (protocol === 'yt-dlp') return <Video className="w-5 h-5 text-red-500" />;
    if (protocol === 'aria2') return <Cpu className="w-5 h-5 text-orange-400" />;
    if (protocol === 'sftp' || protocol === 'ftp') return <Shield className="w-5 h-5 text-green-400" />;
    if (protocol === 'webdav') return <Cloud className="w-5 h-5 text-blue-400" />;
    if (protocol === 'cloud') return <Cpu className="w-5 h-5 text-blue-400" />;
    if (type.includes('image')) return <ImageIcon className="w-5 h-5 text-blue-400" />;
    if (type.includes('video')) return <Video className="w-5 h-5 text-purple-400" />;
    if (type.includes('audio')) return <Music className="w-5 h-5 text-pink-400" />;
    return <FileText className="w-5 h-5 text-gray-400" />;
  };

  const getProtocolBadge = (protocol: string, url?: string) => {
    if (url?.startsWith('torrent://')) {
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-tighter bg-blue-500/10 text-blue-400 border-blue-500/20">
          TORRENT
        </span>
      );
    }
    const colors: Record<string, string> = {
      magnet: 'bg-red-500/10 text-red-400 border-red-500/20',
      ipfs: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      hls: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      'yt-dlp': 'bg-red-500/10 text-red-500 border-red-500/20',
      aria2: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      sftp: 'bg-green-500/10 text-green-400 border-green-500/20',
      ftp: 'bg-green-500/10 text-green-400 border-green-500/20',
      webdav: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      cloud: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      http: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    };
    return (
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-tighter ${colors[protocol] || colors.http}`}>
        {protocol}
      </span>
    );
  };

  const selectedTask = useMemo(() => downloads.find(d => d.id === selectedTaskId), [downloads, selectedTaskId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const text = e.dataTransfer.getData('text');
    if (text && (text.startsWith('http') || text.startsWith('magnet:'))) {
      handleAddDownload(text);
    }
  };

  return (
    <div 
      className="min-h-screen bg-[#050505] text-gray-100 font-sans selection:bg-blue-500/30 overflow-hidden flex"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-blue-600/10 backdrop-blur-sm border-4 border-dashed border-blue-500/50 flex flex-col items-center justify-center pointer-events-none"
          >
            <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-blue-500/20 shadow-2xl flex flex-col items-center">
              <Download className="w-16 h-16 text-blue-400 mb-4 animate-bounce" />
              <h2 className="text-2xl font-bold text-white">Drop to Download</h2>
              <p className="text-gray-500 mt-2">NeurDL AI will automatically detect the protocol</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Raycast Style */}
      <aside className="w-72 bg-[#0a0a0a] border-r border-white/5 flex flex-col">
        <button 
          onClick={() => setSelectedTaskId(null)}
          className="p-6 flex items-center gap-3 hover:bg-white/5 w-full transition-colors"
        >
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black fill-black" />
          </div>
          <span className="font-bold tracking-tight text-sm uppercase">NeurDL Shell</span>
        </button>

        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          <div className="px-4 mb-2 text-[10px] font-bold text-gray-600 uppercase tracking-widest">Navigation</div>
          <button 
            onClick={() => setActiveTab('all')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs transition-all",
              activeTab === 'all' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            All Tasks
          </button>
          <button 
            onClick={() => setActiveTab('downloading')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs transition-all",
              activeTab === 'downloading' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            )}
          >
            <Activity className="w-4 h-4" />
            Active
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs transition-all",
              activeTab === 'completed' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            Finished
          </button>

          <div className="pt-6 px-4 mb-2 text-[10px] font-bold text-gray-600 uppercase tracking-widest">Active Tasks</div>
          {downloads
            .filter(d => activeTab === 'all' || (activeTab === 'downloading' && d.status !== 'completed') || (activeTab === 'completed' && d.status === 'completed'))
            .map(item => (
            <div key={item.id} className="relative group">
              <button 
                onClick={() => setSelectedTaskId(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs transition-all",
                  selectedTaskId === item.id ? "bg-blue-600/10 border border-blue-500/20" : "hover:bg-white/5 border border-transparent"
                )}
              >
                <div className="shrink-0">
                  {getFileIcon(item.type, item.protocol, item.url)}
                </div>
                <div className="flex-1 text-left truncate">
                  <div className="font-bold text-gray-200 truncate">{item.filename}</div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5">
                    <span>{Math.round(item.progress)}%</span>
                    <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                    <span>{item.status === 'downloading' ? item.speed : item.status}</span>
                  </div>
                </div>
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  removeDownload(item.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-red-500/10 text-red-400 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </nav>

        {/* AI Optimizer Mini Dashboard */}
        <div className="p-4 border-t border-white/5 bg-black/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-blue-400">
              <Cpu className="w-3 h-3" />
              <span className="text-[9px] font-bold uppercase tracking-wider">AI Optimizer</span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>CPU</span>
              <span className="font-mono">{Math.round(optimizer.cpu)}%</span>
            </div>
            <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div className="h-full bg-blue-500" animate={{ width: `${optimizer.cpu}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-500">
              <span>Threads</span>
              <span className="text-blue-400 font-bold">{optimizer.threads}</span>
            </div>
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-t border-white/5 bg-black/40">
          {!user ? (
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className={cn(
                "w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all shadow-lg",
                isLoggingIn 
                  ? "bg-blue-600/50 text-white/50 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20"
              )}
            >
              {isLoggingIn ? (
                <Activity className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {isLoggingIn ? "Connecting..." : "Login with Google"}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-white truncate">{user.displayName || 'User'}</div>
                  <div className="text-[9px] text-gray-500 truncate">{user.email}</div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  title="Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {/* Quota Display */}
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-purple-400">
                    <Sparkles className="w-3 h-3" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">AI Quota</span>
                  </div>
                  <span className="text-[10px] font-mono text-white">{userProfile?.aiQuota ?? 0} / 50</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-purple-500" 
                    initial={{ width: 0 }}
                    animate={{ width: `${((userProfile?.aiQuota ?? 0) / 50) * 100}%` }} 
                  />
                </div>
                <p className="text-[8px] text-gray-500 mt-2 leading-relaxed">
                  {userProfile?.aiQuota === 0 
                    ? "Quota exhausted. Upgrade for more." 
                    : "Used for intelligent protocol analysis."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/5">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all"
          >
            <Settings className="w-4 h-4" />
            System Settings
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-[#050505]">
        {selectedTask ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Task Header */}
            <header className="p-8 border-b border-white/5 flex items-start justify-between">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                  {getFileIcon(selectedTask.type, selectedTask.protocol, selectedTask.url)}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-white">{selectedTask.filename}</h1>
                    {getProtocolBadge(selectedTask.protocol, selectedTask.url)}
                  </div>
                  <p className="text-sm text-gray-500 font-mono truncate max-w-xl">{selectedTask.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => toggleStatus(selectedTask.id)}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                >
                  {selectedTask.status === 'downloading' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button 
                  onClick={() => removeDownload(selectedTask.id)}
                  className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setSelectedTaskId(null)}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all ml-4"
                  title="Close Details"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Task Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Progress', value: `${Math.round(selectedTask.progress)}%`, icon: Activity, color: 'text-blue-400' },
                  { label: 'Size', value: formatSize(selectedTask.size), icon: Box, color: 'text-purple-400' },
                  { label: 'Speed', value: selectedTask.speed, icon: Zap, color: 'text-yellow-400' },
                  { label: 'ETA', value: selectedTask.status === 'completed' ? 'Finished' : '1m 24s', icon: Clock, color: 'text-green-400' },
                ].map(stat => (
                  <div key={stat.label} className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                      <stat.icon className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{stat.label}</span>
                    </div>
                    <div className={cn("text-xl font-bold", stat.color)}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Speed Curve */}
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4" />
                    Real-time Speed Curve
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="text-[10px] text-gray-500">MB/s</span>
                  </div>
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedTask.speedHistory}>
                      <defs>
                        <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="time" hide />
                      <YAxis hide domain={[0, 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#3b82f6', fontSize: '12px' }}
                        labelStyle={{ display: 'none' }}
                        formatter={(value: number) => [`${value.toFixed(1)} MB/s`, 'Speed']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="speed" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorSpeed)" 
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chunk Map */}
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4" />
                  Fragment Chunk Map
                </h3>
                <div className="grid grid-cols-20 gap-1">
                  {selectedTask.chunks.map((downloaded, i) => (
                    <motion.div 
                      key={i}
                      initial={false}
                      animate={{ 
                        backgroundColor: downloaded ? '#3b82f6' : '#ffffff05',
                        boxShadow: downloaded ? '0 0 8px rgba(59,130,246,0.3)' : 'none'
                      }}
                      className="aspect-square rounded-[2px] transition-colors duration-300"
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-4 text-[10px] text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm bg-blue-500"></div>
                    <span>Downloaded</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm bg-white/5"></div>
                    <span>Pending</span>
                  </div>
                </div>
              </div>

              {/* Protocol Strategy & Unified Downloader */}
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    Unified Download Strategy
                  </h3>
                  <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] text-indigo-400 font-bold">
                    {selectedTask.protocol.toUpperCase()} HANDLER
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-10 gap-1">
                    {selectedTask.chunks.map((downloaded, i) => (
                      <motion.div
                        key={i}
                        className={`h-2 rounded-sm ${downloaded ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-white/5'}`}
                        initial={false}
                        animate={{ opacity: downloaded ? 1 : 0.3 }}
                      />
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-blue-500 rounded-sm shadow-[0_0_4px_rgba(59,130,246,0.5)]" />
                        <span className="text-gray-400">Downloaded</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-white/5 rounded-sm" />
                        <span className="text-gray-400">Pending</span>
                      </div>
                    </div>
                    <div className="text-gray-500 font-mono">
                      {selectedTask.chunks.filter(c => c).length}% Verified
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Insight */}
              {(selectedTask.protocol === 'yt-dlp' || selectedTask.protocol === 'aria2') && (
                <div className="bg-orange-500/5 border border-orange-500/10 p-6 rounded-2xl mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      AI Engine Optimization
                    </h3>
                    <Sparkles className="w-4 h-4 text-orange-400 animate-pulse" />
                  </div>
                  <div className="space-y-4">
                    <div className="p-3 bg-black/40 rounded-xl font-mono text-[10px] text-orange-300/80 border border-orange-500/10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        <span>Analyzing {selectedTask.protocol} logs...</span>
                      </div>
                      <div className="opacity-50">
                        {engineOptimizer?.parameters || (selectedTask.protocol === 'aria2' ? 
                          "> aria2c --max-connection-per-server=16 --split=32" :
                          "> yt-dlp --newline --progress --merge-output-format mp4")}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400 leading-relaxed italic">
                      "{engineOptimizer?.insight || "AI is analyzing server-side throttling patterns to optimize connection pool..."}"
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-blue-600/5 border border-blue-500/10 p-6 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest">AI Content Insight</h3>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed italic">
                  "{selectedTask.description || "Analyzing file structure and metadata for optimal chunking..."}"
                </p>
              </div>

              {/* P2P Health Dashboard (Magnet Only) */}
              {selectedTask.protocol === 'magnet' && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Zap className="w-4 h-4 text-red-400" />
                        AI Tracker Optimization
                      </h3>
                      {p2pOptimizer && (
                        <div className="flex items-center gap-1.5 text-[10px] text-green-400 font-bold">
                          <ShieldCheck className="w-3 h-3" />
                          OPTIMIZED
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {selectedTask.trackers?.map((tracker, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                          <div className="flex flex-col gap-1 truncate max-w-[70%]">
                            <span className="text-[10px] font-mono text-gray-400 truncate">{tracker.url}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-green-500 font-bold uppercase tracking-tighter">{tracker.status}</span>
                              <span className="text-[9px] text-gray-600">S: {tracker.seeds} L: {tracker.leeches}</span>
                            </div>
                          </div>
                          {p2pOptimizer?.topTrackers.includes(tracker.url) && (
                            <div className="p-1 bg-blue-500/20 rounded-md">
                              <Sparkles className="w-3 h-3 text-blue-400" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      Peer Health Map
                    </h3>
                    <div className="space-y-4">
                      {selectedTask.peers?.map((peer, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-gray-400 font-mono">{peer.ip}</span>
                            <span className="text-blue-400 font-bold">{peer.speed}</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-blue-500" 
                              initial={{ width: 0 }}
                              animate={{ width: `${peer.health}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {p2pOptimizer && (
                        <div className="mt-4 p-3 bg-blue-600/5 border border-blue-500/10 rounded-xl">
                          <p className="text-[10px] text-blue-300 italic leading-tight">
                            "AI: {p2pOptimizer.insight}"
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-12 overflow-y-auto">
            {/* Top Zone: Universal Input */}
            <div className="max-w-4xl mx-auto w-full mb-12">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 shadow-2xl">
                  <div className="flex items-center gap-6 mb-6">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                      <Command className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight">NeurDL Command Center</h2>
                      <p className="text-sm text-gray-500">Paste URL, drag files, or search your library</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                    <input 
                      type="text" 
                      placeholder={isAnalyzing ? "Analyzing link..." : "https://example.com/file.zip or magnet:?xt=urn:btih:..."}
                      className={cn(
                        "w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-24 text-sm outline-none focus:border-blue-500/50 transition-all font-mono",
                        isAnalyzing && "opacity-50 cursor-not-allowed"
                      )}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !isAnalyzing && handleAddDownload()}
                      disabled={isAnalyzing}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      {isAnalyzing ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Processing</span>
                        </div>
                      ) : (
                        <>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".torrent"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleAddDownload(`torrent://${file.name}`);
                              }
                            }}
                          />
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 hover:bg-white/10 rounded-xl text-gray-500 hover:text-white transition-all"
                            title="Upload .torrent"
                          >
                            <Upload className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-600">
                    <Folder className="w-3 h-3" />
                    <span>Saving to: <span className="text-gray-400 font-mono">{downloadPath}</span></span>
                    <button 
                      onClick={() => setShowSettings(true)}
                      className="ml-2 text-blue-500/50 hover:text-blue-500 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Zone: Bento Dashboard */}
            <div className="max-w-6xl mx-auto w-full grid grid-cols-12 gap-6 mb-12">
              {/* Global Speed Chart */}
              <div className="col-span-8 bg-[#0a0a0a] border border-white/5 rounded-3xl p-6 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Activity className="w-4 h-4 text-blue-400" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Network Throughput</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="w-3 h-3 text-blue-400" />
                      <span className="text-xs font-mono text-white">
                        {globalSpeedHistory[globalSpeedHistory.length - 1].speed.toFixed(1)} MB/s
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 h-48 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={globalSpeedHistory}>
                      <defs>
                        <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" hide />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#3b82f6', fontSize: '12px' }}
                        labelStyle={{ display: 'none' }}
                        formatter={(value: number) => [`${value.toFixed(1)} MB/s`, 'Global Speed']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="speed" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorSpeed)" 
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AI Optimizer Status */}
              <div className="col-span-4 space-y-6">
                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">AI Optimizer</h3>
                    <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-500 uppercase">Threads</span>
                      <span className="text-xs font-mono text-white">{optimizer.threads} Active</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-500 uppercase">Buffer</span>
                      <span className="text-xs font-mono text-white">{optimizer.bufferSize} MB</span>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl">
                      <p className="text-[10px] text-gray-400 italic leading-snug">
                        "{optimizer.reasoning}"
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <HardDrive className="w-4 h-4 text-orange-400" />
                    </div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Disk Space</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>NVMe SSD</span>
                      <span>1.2 TB / 2 TB</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full w-3/5 bg-orange-500 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Zone: Recent Activity & Quick Actions */}
            <div className="max-w-6xl mx-auto w-full grid grid-cols-12 gap-6">
              {/* Recent Tasks */}
              <div className="col-span-8">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Recent Activity
                  </h3>
                  <button 
                    onClick={() => setActiveTab('all')}
                    className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-3">
                  {downloads.slice(0, 3).map(item => (
                    <div key={item.id} className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:border-white/10 transition-all group">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/5">
                        {getFileIcon(item.type, item.protocol, item.url)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-bold text-white truncate">{item.filename}</h4>
                          {getProtocolBadge(item.protocol, item.url)}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-blue-500" 
                              initial={{ width: 0 }}
                              animate={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-gray-500">{Math.round(item.progress)}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => toggleStatus(item.id)}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                          {item.status === 'downloading' ? <Pause className="w-4 h-4 text-gray-400" /> : <Play className="w-4 h-4 text-gray-400" />}
                        </button>
                        <button 
                          onClick={() => setSelectedTaskId(item.id)}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                          <ArrowUpRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {downloads.length === 0 && (
                    <div className="p-12 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center">
                      <Download className="w-8 h-8 text-gray-700 mb-4" />
                      <p className="text-xs text-gray-600">No active downloads. Paste a URL to begin.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* System Intelligence Panel */}
              <div className="col-span-4">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    System Intelligence
                  </h3>
                </div>
                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6 space-y-6">
                  {/* Protocol Distribution */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Protocol Distribution</h4>
                      <span className="text-[10px] text-gray-500 font-mono">{downloads.length} Active</span>
                    </div>
                    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-white/5">
                      <div className="h-full bg-red-500" style={{ width: '45%' }} />
                      <div className="h-full bg-blue-500" style={{ width: '30%' }} />
                      <div className="h-full bg-purple-500" style={{ width: '15%' }} />
                      <div className="h-full bg-green-500" style={{ width: '10%' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-[9px] text-gray-500 uppercase">Magnet</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span className="text-[9px] text-gray-500 uppercase">HTTP/S</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        <span className="text-[9px] text-gray-500 uppercase">IPFS</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-[9px] text-gray-500 uppercase">Torrent</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Efficiency Meter */}
                  <div className="pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">AI Efficiency Gain</h4>
                      <span className="text-xs font-mono text-blue-400">+38.4%</span>
                    </div>
                    <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
                      <p className="text-[10px] text-blue-300/70 leading-relaxed italic">
                        "AI is currently prioritizing high-availability nodes and optimizing TCP window sizes based on your ISP's MTU."
                      </p>
                    </div>
                  </div>

                  {/* Global Connectivity */}
                  <div className="pt-6 border-t border-white/5 flex justify-between items-center">
                    <div className="space-y-1">
                      <span className="text-[9px] text-gray-600 uppercase block tracking-tighter">Total Peers</span>
                      <span className="text-sm font-mono text-white">1,428</span>
                    </div>
                    <div className="space-y-1 text-right">
                      <span className="text-[9px] text-gray-600 uppercase block tracking-tighter">Active Seeds</span>
                      <span className="text-sm font-mono text-green-400">512</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                    <Settings className="w-4 h-4 text-white" />
                  </div>
                  <h2 className="font-bold text-sm uppercase tracking-widest">System Settings</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">AI Engine</h3>
                    <span className="text-[10px] text-blue-400 font-bold uppercase tracking-tighter">Recommended</span>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-gray-300">Auto-Protocol Detection & Optimization</span>
                      </div>
                      <button 
                        onClick={() => setAiEngineEnabled(!aiEngineEnabled)}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-colors duration-200",
                          aiEngineEnabled ? "bg-blue-600" : "bg-gray-800"
                        )}
                      >
                        <motion.div 
                          animate={{ x: aiEngineEnabled ? 20 : 0 }}
                          className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full shadow-sm" 
                        />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      Uses Gemini AI to automatically identify protocols (Magnet, HTTP, IPFS, etc.) and optimize TCP window sizes, buffer allocation, and peer selection for maximum efficiency.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Storage</h3>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 px-1">Download Path (Local Drive Supported)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        id="download-path-input"
                        value={downloadPath}
                        onChange={(e) => setDownloadPath(e.target.value)}
                        placeholder="e.g. D:\Downloads or /home/user/downloads"
                        className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs outline-none focus:border-blue-500/50 transition-all font-mono"
                      />
                      <button 
                        onClick={() => {
                          setPathHint("Browser security prevents direct folder selection. Please type your local path manually.");
                          document.getElementById('download-path-input')?.focus();
                          setTimeout(() => setPathHint(null), 5000);
                        }}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all group"
                      >
                        <Folder className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                      </button>
                    </div>
                    <AnimatePresence>
                      {pathHint && (
                        <motion.p 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-[9px] text-blue-400 italic px-1"
                        >
                          {pathHint}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Network</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 px-1">
                      <span>Max Connections per Task</span>
                      <span className="text-blue-400 font-mono font-bold">{maxConnections}</span>
                    </div>
                    <div className="relative h-6 flex items-center">
                      <input 
                        type="range" 
                        min="8" 
                        max="256" 
                        step="8"
                        value={maxConnections}
                        onChange={(e) => setMaxConnections(parseInt(e.target.value))}
                        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-blue-600"
                        style={{
                          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((maxConnections - 8) / (256 - 8)) * 100}%, rgba(255, 255, 255, 0.05) ${((maxConnections - 8) / (256 - 8)) * 100}%, rgba(255, 255, 255, 0.05) 100%)`
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[8px] text-gray-700 uppercase px-1">
                      <span>8 (Stable)</span>
                      <span>256 (High Load)</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-white/5 border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="px-6 py-2 bg-white text-black text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Background Accents */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] -z-10 pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] -z-10 pointer-events-none"></div>
    </div>
  );
}
