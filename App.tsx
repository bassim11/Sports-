import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HlsPlayer } from './components/HlsPlayer';
import { parseM3u, getSampleArabicChannels } from './m3uParser';
import { M3uChannel } from './types';
import { 
  Play, 
  Tv, 
  Wifi, 
  Settings, 
  Film, 
  Layers, 
  Upload, 
  Search, 
  Heart, 
  Trash2, 
  List, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  FileUp, 
  ExternalLink,
  ChevronRight,
  Info,
  Layers3,
  ListMusic,
  Share2
} from 'lucide-react';

const DEFAULT_STREAM = "https://af.ayassport.ir/hls2/bein1.m3u8";

const App: React.FC = () => {
  // Playlist & Channel State
  const [channels, setChannels] = useState<M3uChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<M3uChannel | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playlistName, setPlaylistName] = useState<string>("");

  // Video Sources State
  const [streamUrl, setStreamUrl] = useState<string>(DEFAULT_STREAM);
  const [urlInput, setUrlInput] = useState<string>(DEFAULT_STREAM);
  const [playlistUrlInput, setPlaylistUrlInput] = useState<string>("");
  const [multiLinksInput, setMultiLinksInput] = useState<string>("");
  const [playerInputTab, setPlayerInputTab] = useState<'single' | 'multiple'>('single');

  // UI Filters State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("الكل");

  // UX Status State
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Load Persisted Channel Data on Mount
  useEffect(() => {
    try {
      const storedChannels = localStorage.getItem('streamflow_channels');
      const storedName = localStorage.getItem('streamflow_playlist_name');
      const storedFavs = localStorage.getItem('streamflow_favorites');
      const lastPlayedUrl = localStorage.getItem('streamflow_last_played_url');
      const lastPlayedChannel = localStorage.getItem('streamflow_last_played_channel');

      if (storedChannels) {
        const parsed = JSON.parse(storedChannels) as M3uChannel[];
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          setChannels(parsed);
          
          if (lastPlayedChannel) {
            const chanObj = JSON.parse(lastPlayedChannel) as M3uChannel;
            setSelectedChannel(chanObj);
            setStreamUrl(chanObj.url);
            setUrlInput(chanObj.url);
          } else {
            setSelectedChannel(parsed[0]);
            setStreamUrl(parsed[0].url);
            setUrlInput(parsed[0].url);
          }
        }
      } else if (lastPlayedUrl) {
        setStreamUrl(lastPlayedUrl);
        setUrlInput(lastPlayedUrl);
      }

      if (storedName) {
        setPlaylistName(storedName);
      }

      if (storedFavs) {
        setFavorites(JSON.parse(storedFavs) as string[]);
      }
    } catch (e) {
      console.error("Failed to restore initial state", e);
    }
  }, []);

  // Save Selected Channel / Last Stream Url is updated
  const handleSelectChannel = (channel: M3uChannel) => {
    setSelectedChannel(channel);
    setStreamUrl(channel.url);
    setUrlInput(channel.url);
    localStorage.setItem('streamflow_last_played_url', channel.url);
    localStorage.setItem('streamflow_last_played_channel', JSON.stringify(channel));
  };

  // Direct Submission of Custom Video Link
  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      const trimmed = urlInput.trim();
      setStreamUrl(trimmed);
      setSelectedChannel(null); // Deselect playlist channel since we loaded a manual URL
      localStorage.setItem('streamflow_last_played_url', trimmed);
      localStorage.removeItem('streamflow_last_played_channel');
      setSuccessMsg("تم تحديث الرابط بنجاح!");
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  // Parsing & Storing local M3U file
  const processM3uText = (text: string, sourceName: string) => {
    const parsed = parseM3u(text);
    if (parsed.length > 0) {
      setChannels(parsed);
      setPlaylistName(sourceName);
      setSelectedChannel(parsed[0]);
      setStreamUrl(parsed[0].url);
      setUrlInput(parsed[0].url);
      setSelectedCategory("الكل");
      setSearchQuery("");

      localStorage.setItem('streamflow_channels', JSON.stringify(parsed));
      localStorage.setItem('streamflow_playlist_name', sourceName);
      localStorage.setItem('streamflow_last_played_url', parsed[0].url);
      localStorage.setItem('streamflow_last_played_channel', JSON.stringify(parsed[0]));

      setSuccessMsg(`تم تحميل القائمة المرفوعة بنجاح! تحتوي على ${parsed.length} قناة.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } else {
      setErrorMsg("عذراً، لم نتمكن من العثور على أي عناوين قنوات صالحة في هذا الملف.");
      setTimeout(() => setErrorMsg(null), 5000);
    }
  };

  // Local File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        processM3uText(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  // Remote URL fetching with Proxy fallback support
  const handleRemoteUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = playlistUrlInput.trim();
    if (!targetUrl) return;

    setIsFetching(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Direct and CORS bypass proxies
    const urlsToTry = [
      targetUrl,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    let success = false;
    let textResult = "";

    for (let i = 0; i < urlsToTry.length; i++) {
      try {
        const response = await fetch(urlsToTry[i]);
        if (response.ok) {
          textResult = await response.text();
          if (textResult && textResult.toUpperCase().includes('#EXTINF')) {
            success = true;
            break;
          }
        }
      } catch (err) {
        console.warn(`Fetch step ${i} failed. Trying alternative routes...`);
      }
    }

    setIsFetching(false);

    if (success && textResult) {
      const fileName = targetUrl.split('/').pop()?.split('?')[0] || "قائمة قنوات خارجية";
      processM3uText(textResult, fileName);
      setPlaylistUrlInput("");
    } else {
      setErrorMsg("تعذر جلب القائمة من هذا الرابط الإلكتروني بسبب قيود الأمان للمتصفح (CORS). يرجى تحميل ملف الـ M3U على جهازك أولاً ثم رفعه هنا.");
      setTimeout(() => setErrorMsg(null), 8000);
    }
  };

  // Parsing & Storing several streaming links (Direct Playback helper)
  const handleMultiLinksSubmit = (e: React.FormEvent, append: boolean = false) => {
    e.preventDefault();
    const lines = multiLinksInput.split(/\r?\n/);
    const parsedChannels: M3uChannel[] = [];
    let index = append ? (channels.length + 1) : 1;
    let validCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('http') || line.startsWith('rtmp') || line.includes('/')) {
        parsedChannels.push({
          id: `multi-link-${append ? channels.length + validCount : validCount + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: `قناة ${index}`,
          url: line,
          group: 'روابط مخصصة (Custom Links)',
        });
        index++;
        validCount++;
      }
    }

    if (parsedChannels.length > 0) {
      if (append) {
        const merged = [...channels, ...parsedChannels];
        setChannels(merged);
        localStorage.setItem('streamflow_channels', JSON.stringify(merged));
        setSuccessMsg(`تم إضافة ${parsedChannels.length} قناة جديدة بنجاح!`);
      } else {
        setChannels(parsedChannels);
        setPlaylistName("روابط مخصصة مسلسلة");
        setSelectedChannel(parsedChannels[0]);
        setStreamUrl(parsedChannels[0].url);
        setUrlInput(parsedChannels[0].url);
        setSelectedCategory("الكل");
        setSearchQuery("");

        localStorage.setItem('streamflow_channels', JSON.stringify(parsedChannels));
        localStorage.setItem('streamflow_playlist_name', "روابط مخصصة مسلسلة");
        localStorage.setItem('streamflow_last_played_url', parsedChannels[0].url);
        localStorage.setItem('streamflow_last_played_channel', JSON.stringify(parsedChannels[0]));

        setSuccessMsg(`تم إنشاء ${parsedChannels.length} قناة مسلسلة بنجاح!`);
      }
      setMultiLinksInput("");
      setTimeout(() => setSuccessMsg(null), 5000);
    } else {
      setErrorMsg("لم نجد أي روابط صالحة في المربع المدخل. يرجى إدخال رابط واحد على الأقل في كل سطر.");
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Load Demo M3U Pack
  const handleLoadDemo = () => {
    const demo = getSampleArabicChannels();
    setChannels(demo);
    setPlaylistName("الباقة العربية التجريبية");
    setSelectedChannel(demo[0]);
    setStreamUrl(demo[0].url);
    setUrlInput(demo[0].url);
    setSelectedCategory("الكل");
    setSearchQuery("");

    localStorage.setItem('streamflow_channels', JSON.stringify(demo));
    localStorage.setItem('streamflow_playlist_name', "الباقة العربية التجريبية");
    localStorage.setItem('streamflow_last_played_url', demo[0].url);
    localStorage.setItem('streamflow_last_played_channel', JSON.stringify(demo[0]));

    setSuccessMsg("تم تفعيل الباقة التجريبية! تصفح القنوات الرياضية والإخبارية.");
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Toggle Favorite
  const handleToggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated: string[];
    if (favorites.includes(id)) {
      updated = favorites.filter(favId => favId !== id);
    } else {
      updated = [...favorites, id];
    }
    setFavorites(updated);
    localStorage.setItem('streamflow_favorites', JSON.stringify(updated));
  };

  // Clear Playlist Cache
  const handleClearPlaylist = () => {
    setChannels([]);
    setSelectedChannel(null);
    setPlaylistName("");
    setFavorites([]);
    localStorage.removeItem('streamflow_channels');
    localStorage.removeItem('streamflow_playlist_name');
    localStorage.removeItem('streamflow_favorites');
    localStorage.removeItem('streamflow_last_played_channel');
    setShowClearConfirm(false);
    setSuccessMsg("تم مسح قائمة القنوات بنجاح.");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Drag & Drop Handlers
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
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.m3u') || file.name.endsWith('.m3u8') || file.name.endsWith('.txt'))) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          processM3uText(text, file.name);
        }
      };
      reader.readAsText(file);
    } else {
      setErrorMsg("الملف غير مدعوم. يرجى سحب ملف بصيغة m3u أو m3u8.");
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Derive unique categories dynamically
  const categories = useMemo(() => {
    const list = new Set<string>();
    channels.forEach(c => {
      if (c.group) {
        list.add(c.group);
      }
    });
    return Array.from(list).sort();
  }, [channels]);

  // Filter channels based on Search + Category Tab
  const filteredChannels = useMemo(() => {
    return channels.filter(channel => {
      const matchSearch = 
        channel.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (channel.group && channel.group.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (selectedCategory === "الكل") {
        return matchSearch;
      }
      if (selectedCategory === "المفضلة ⭐") {
        return favorites.includes(channel.id) && matchSearch;
      }
      return (channel.group || 'غير مصنف') === selectedCategory && matchSearch;
    });
  }, [channels, searchQuery, selectedCategory, favorites]);

  // High performance safeguard: render max 150 channels to prevent DOM lags.
  const visibleChannels = useMemo(() => {
    return filteredChannels.slice(0, 150);
  }, [filteredChannels]);

  // Extract first letters of name for beautiful channel logo fallback
  const getInitials = (name: string) => {
    const cleaned = name.replace(/[^a-zA-Z0-9أ-ي]/g, ' ').trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0] ? parts[0].substring(0, 2).toUpperCase() : 'CH';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 p-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 rounded-xl shadow-lg shadow-orange-950/30">
              <Layers3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-300 font-extrabold">BSOM MDOC</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider">المنصة الذكية وقارئ الملفات والوسائط الرقمية</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-4">
            {playlistName && (
              <div className="text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>الملف الجاري: {playlistName} ({channels.length} قناة)</span>
              </div>
            )}
            
            <div className="text-xs font-medium text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                يدعم الملفات وقوائم التشغيل المخصصة
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6">

        {/* Global Feedback Messages */}
        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl flex items-center gap-3 animate-in fade-in duration-300">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl flex items-center gap-3 animate-in fade-in duration-300">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-sm font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Workspace Layout: Grid changes depending of playlist is loaded */}
        {channels.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Player Main Section (Spans 2 columns) */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              
              {/* Aspect Video Card wrapper */}
              <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-slate-800 ring-4 ring-slate-900/60 group">
                {/* Visual backlighting glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-20 blur-xl group-hover:opacity-35 transition duration-1000"></div>
                
                <div className="relative h-full w-full z-10">
                  <HlsPlayer src={streamUrl} />
                </div>
              </div>

              {/* Current Stream Info */}
              <div className="bg-slate-900/70 border border-slate-800/80 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center text-blue-400 border border-slate-700/50 shrink-0">
                    {selectedChannel?.logo ? (
                      <img 
                        src={selectedChannel.logo} 
                        alt={selectedChannel.name} 
                        className="w-10 h-10 object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Tv className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-white">
                      {selectedChannel ? selectedChannel.name : "بث فيديو مباشر مخصص"}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span className="bg-slate-800 px-2 py-0.5 rounded text-blue-400 font-medium">
                        {selectedChannel?.group || "رابط مخصص"}
                      </span>
                      <span className="font-mono text-[10px] truncate max-w-[200px] sm:max-w-xs block" dir="ltr">
                        {streamUrl}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {selectedChannel && (
                    <button
                      onClick={(e) => handleToggleFavorite(selectedChannel.id, e)}
                      className={`p-2.5 rounded-xl border transition-all ${
                        favorites.includes(selectedChannel.id)
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500/20'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                      title="إضافة إلى المفضلة"
                    >
                      <Heart className="w-5 h-5 fill-current" />
                    </button>
                  )}
                </div>
              </div>

              {/* URL & Multiple Links Inputs under the player */}
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <span className="text-xs font-bold text-slate-300">إضافة روابط تشغيل مخصصة للبث المباشر</span>
                  <div className="flex bg-slate-950/80 border border-slate-800 p-0.5 rounded-lg self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setPlayerInputTab('single')}
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                        playerInputTab === 'single'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      رابط بث سريع
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayerInputTab('multiple')}
                      className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                        playerInputTab === 'multiple'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      عدة روابط مسلسلة
                    </button>
                  </div>
                </div>

                {playerInputTab === 'single' ? (
                  <form onSubmit={handleUrlSubmit} className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="أدخل رابط مخصص مباشر (m3u8, mp4)..."
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 pl-4 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 text-left"
                        dir="ltr"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-slate-800 hover:bg-slate-755 border border-slate-700 hover:border-slate-650 px-4 py-2 rounded-xl text-xs font-bold text-slate-200 transition-all flex items-center gap-2 shrink-0"
                    >
                      <Play className="w-3.5 h-3.5 fill-current text-blue-500" />
                      <span>تشغيل الرابط</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(e) => handleMultiLinksSubmit(e, true)} className="flex flex-col gap-3">
                    <div className="relative">
                      <textarea
                        value={multiLinksInput}
                        onChange={(e) => setMultiLinksInput(e.target.value)}
                        placeholder="أدخل روابط التشغيل هنا (رابط واحد في كل سطر) وسيتم ترقيم القنوات تلقائياً حسب تسلسل إدخالها...&#10;https://example.com/channel1.m3u8&#10;https://example.com/channel2.m3u8"
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-300 placeholder:text-slate-650 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 text-left font-mono h-28 resize-none"
                        dir="ltr"
                      />
                    </div>
                    
                    <div className="flex flex-wrap gap-2.5 justify-end">
                      <button
                        type="button"
                        onClick={(e) => handleMultiLinksSubmit(e, false)}
                        className="bg-slate-800 hover:bg-slate-750 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold text-slate-300 transition-all flex items-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                        <span>استبدال كقائمة جديدة</span>
                      </button>
                      <button
                        type="submit"
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-550 hover:to-indigo-550 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-blue-650/20"
                      >
                        إضافة للقائمة الحالية (+ {multiLinksInput.split(/\r?\n/).filter(l => l.trim()).length})
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Channels Sidebar Container (Spans 1 column) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[740px] shadow-xl relative z-10">
              
              {/* Sidebar Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4 h-12">
                <div className="flex items-center gap-2">
                  <ListMusic className="w-5 h-5 text-blue-400" />
                  <span className="font-bold text-sm text-slate-200 truncate max-w-[140px]">{playlistName || "القنوات المشغلة"}</span>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-blue-400 font-bold">
                    {channels.length} قنوات
                  </span>
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all text-xs flex items-center gap-1.5 font-bold"
                  title="حذف القائمة الحالية ورفع قائمة جديدة"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>تصفير</span>
                </button>
              </div>

              {/* Confirmation Dialog overlay for clear */}
              {showClearConfirm && (
                <div className="absolute inset-0 bg-slate-950/95 rounded-2xl p-6 flex flex-col justify-center items-center text-center z-50 animate-in fade-in duration-200">
                  <Trash2 className="w-12 h-12 text-red-500 mb-3 animate-bounce" />
                  <h3 className="text-base font-bold text-white mb-2">هل أنت متأكد من تصفير القنوات؟</h3>
                  <p className="text-xs text-slate-400 mb-6 max-w-xs">هذا الإجراء سيقوم بحذف القائمة المحفوظة وأي قنوات قمت بوضعها في المفضلة.</p>
                  
                  <div className="flex gap-3 w-full max-w-xs">
                    <button
                      onClick={handleClearPlaylist}
                      className="flex-1 bg-red-600 hover:bg-red-550 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors"
                    >
                      نعم، امسح واستبدل
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold py-2 px-4 rounded-xl text-xs transition-colors"
                    >
                      إلغاء المعاينة
                    </button>
                  </div>
                </div>
              )}

              {/* Live Search Engine */}
              <div className="relative mb-3.5">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن اسم القناة أو الفئة..."
                  className="w-full bg-slate-950 text-slate-250 border border-slate-800 rounded-xl pr-10 pl-3 py-2.5 text-xs placeholder:text-slate-650 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 text-right"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")} 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Categories Navigation Badges (Scrollable horizontally) */}
              <div className="flex gap-2 pb-3 mb-3 border-b border-slate-800/50 overflow-x-auto scrollbar-hide shrink-0 dir-rtl">
                <button
                  onClick={() => setSelectedCategory("الكل")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    selectedCategory === "الكل"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200"
                  }`}
                >
                  الكل ({channels.length})
                </button>
                
                {favorites.length > 0 && (
                  <button
                    onClick={() => setSelectedCategory("المفضلة ⭐")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      selectedCategory === "المفضلة ⭐"
                        ? "bg-rose-600 text-white shadow-md shadow-rose-500/20"
                        : "bg-slate-850 text-rose-450 hover:bg-rose-500/10 hover:text-rose-300"
                    }`}
                  >
                    المفضلة ⭐ ({favorites.length})
                  </button>
                )}

                {categories.map(category => {
                  const categoryCount = channels.filter(c => c.group === category).length;
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold separator whitespace-nowrap shrink-0 ${
                        selectedCategory === category
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200"
                      }`}
                    >
                      {category} ({categoryCount})
                    </button>
                  );
                })}
              </div>

              {/* Channel items list (Dynamic) */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                {visibleChannels.length > 0 ? (
                  visibleChannels.map((channel, idx) => {
                    const isPlayingCh = selectedChannel?.id === channel.id;
                    const isFav = favorites.includes(channel.id);

                    return (
                      <div
                        key={channel.id}
                        onClick={() => handleSelectChannel(channel)}
                        className={`group/item w-full flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border text-right select-none ${
                          isPlayingCh
                            ? "bg-blue-600/10 border-blue-500/45 text-white shadow-lg shadow-blue-500/5"
                            : "bg-slate-950/40 hover:bg-slate-850 border-slate-800/50 hover:border-slate-700/60"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {/* Channel Logo fallback UI */}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center border font-mono text-xs font-bold shrink-0 transition-colors ${
                            isPlayingCh 
                              ? "bg-blue-600/25 border-blue-400/50 text-blue-300" 
                              : "bg-slate-900 border-slate-800 text-slate-400 group-hover/item:border-slate-700 group-hover/item:bg-slate-800"
                          }`}>
                            {channel.logo ? (
                              <img 
                                src={channel.logo}
                                alt=""
                                className="w-7 h-7 object-contain rounded"
                                referrerPolicy="no-referrer"
                                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                              />
                            ) : null}
                            <span className="group-even/item:text-indigo-400 text-blue-400" style={{ display: channel.logo ? 'none' : 'inline' }}>
                              {getInitials(channel.name)}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-bold truncate ${isPlayingCh ? "text-blue-400" : "text-slate-200"}`}>
                              {channel.name}
                            </p>
                            <span className="text-[9px] text-slate-500 tracking-wider truncate block max-w-[150px] mt-0.5">
                              {channel.group || 'غير مصنف'}
                            </span>
                          </div>
                        </div>

                        {/* Actions (Favoriting & Indicator badge) */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => handleToggleFavorite(channel.id, e)}
                            className={`p-1.5 rounded-md hover:scale-110 active:scale-95 transition-all ${
                              isFav
                                ? "text-rose-500 hover:text-rose-450"
                                : "text-slate-600 hover:text-slate-300 opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                            }`}
                            title={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                          >
                            <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
                          </button>
                          
                          {isPlayingCh && (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6] animate-pulse"></div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                    <AlertCircle className="w-9 h-9 opacity-40 mb-2" />
                    <p className="text-xs font-bold">لم نعثر على أي قنوات مطابقة</p>
                    <p className="text-[10px] opacity-70 mt-1">تأكد من اختيار التصنيف الصحيح أو كتابة كلمات بحث أخرى</p>
                  </div>
                )}
              </div>

              {/* Sidebar Footer Performance Hint */}
              {filteredChannels.length > 150 && (
                <div className="border-t border-slate-800/80 pt-2.5 mt-2.5 text-center bg-slate-950/50 p-2 rounded-lg">
                  <p className="text-[10px] text-slate-450">
                    تم عرض أول <span className="text-blue-400 font-bold">150</span> قناة لتوفير السرعة وسلاسة التصفح.
                  </p>
                </div>
              )}
            </div>

          </div>
        ) : (
          /* Empty State: Splash Screen Workspace options to load M3Us */
          <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
            
            {/* Quick Live Preview Banner */}
            <div className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 ring-2 ring-slate-900/40">
              <HlsPlayer src={streamUrl} />
            </div>

            {/* Title Invitation Banner */}
            <div className="text-center space-y-2 py-2">
              <h2 className="text-2xl font-extrabold text-white">تحميل ملف القنوات لتفعيل مشغّل الـ IPTV</h2>
              <p className="text-slate-400 text-xs max-w-lg mx-auto leading-relaxed">
                ادمج جميع قنواتك الفضائية الحية ومحطات البث المفضلة في نافذة تصفح متميزة واحدة. ارفع ملف <span className="text-blue-400 font-mono text-[11px] font-bold">M3U/M3U8</span> الخاص بك في الأسفل للبدء فوراً!
              </p>
            </div>

            {/* Option Grids */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
              
              {/* Option 1: Drag or Browse File Uploader */}
              <div 
                className={`border-2 border-dashed bg-slate-900/50 rounded-2xl p-6 md:p-8 flex flex-col justify-center items-center text-center transition-all ${
                  isDragging 
                    ? "border-blue-500 bg-blue-600/5 scale-[1.01]" 
                    : "border-slate-800 hover:border-slate-700/85 hover:bg-slate-900/70"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="bg-blue-600/10 p-4 rounded-full text-blue-400 mb-4 ring-8 ring-blue-500/5">
                  <FileUp className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-sm text-slate-200">اسحب وأفلت الملف هنا للتحميل</h3>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                  يدعم صيغ <span className="font-mono">m3u, m3u8, txt</span>. يمكنك أيضاً رفع ملفات القنوات المشفرة والمفتوحة.
                </p>

                <label className="mt-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-550 hover:to-indigo-550 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer">
                  <span>تصفح من جهازك</span>
                  <input
                    type="file"
                    accept=".m3u,.m3u8,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Option 2: Paste Link or Load Demo Preset */}
              <div className="bg-slate-900/50 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 md:p-8 flex flex-col justify-between">
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-200">تحميل قائمة IPTV عبر رابط ويب</h3>
                      <p className="text-[10px] text-slate-500">ادخل رابط اشتراك M3U الخاص بك مباشرة</p>
                    </div>
                  </div>

                  <form onSubmit={handleRemoteUrlSubmit} className="space-y-2 pt-2">
                    <input
                      type="url"
                      value={playlistUrlInput}
                      onChange={(e) => setPlaylistUrlInput(e.target.value)}
                      placeholder="https://example.com/playlist.m3u"
                      className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-left"
                      dir="ltr"
                    />
                    
                    <button
                      type="submit"
                      disabled={isFetching}
                      className="w-full bg-slate-800 hover:bg-slate-755 text-white border border-slate-700 hover:border-slate-650 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      {isFetching ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          <span>جاري الفحص المتقدم والتحميل...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                          <span>تحميل القنوات الآن</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/80 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">ليس لديك قائمة قنوات جاهزة؟</span>
                    <button
                      type="button"
                      onClick={handleLoadDemo}
                      className="p-2 py-1 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span>تجربة القنوات المجانية الافتراضية</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Option 3: Paste Multiple Direct Stream Links (Sequential Numbering) */}
              <div className="bg-slate-900/50 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 md:p-8 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400">
                      <ListMusic className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-200">إدخال روابط تشغيل مسلسلة</h3>
                      <p className="text-[10px] text-slate-500">الترقيم التلقائي لروابط القنوات المباشرة</p>
                    </div>
                  </div>

                  <form onSubmit={(e) => handleMultiLinksSubmit(e, false)} className="space-y-3 pt-1">
                    <textarea
                      value={multiLinksInput}
                      onChange={(e) => setMultiLinksInput(e.target.value)}
                      placeholder="أدخل روابط التشغيل هنا (رابط واحد في كل سطر)...&#10;https://example.com/stream1.m3u8&#10;https://example.com/stream2.m3u8&#10;https://example.com/stream3.m3u8"
                      className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-left h-[105px] resize-none"
                      dir="ltr"
                    />
                    
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-550 hover:to-orange-550 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-orange-650/20"
                    >
                      تشغيل الروابط كقنوات مرقمة
                    </button>
                  </form>
                </div>

                <div className="pt-3 border-t border-slate-800/80">
                  <p className="text-[10px] text-slate-550 leading-relaxed">
                    سيقوم هذا الخيار بتحليل كل رابط في سطر جديد وتسمية القنوات بـ <span className="text-amber-400 font-bold">قناة 1</span> و <span className="text-amber-400 font-bold">قناة 2</span> إلخ، وتوفيرها في قائمة التشغيل.
                  </p>
                </div>
              </div>

            </div>

            {/* Mini Informational Guide */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-4 flex gap-3 text-slate-400 text-xs items-center justify-center">
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              <span>
                التطبيق يقوم بحفظ قائمة التشغيل والمفضلة بشكل آمن بذاكرة المتصفح المحلية لتظل جاهزة دائماً فور دخولك.
              </span>
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-900 bg-slate-950/80 mt-12 backdrop-blur">
        <div className="container mx-auto px-4 text-center space-y-2">
          <p className="text-amber-500 font-bold text-sm tracking-widest font-mono">BSOM MDOC</p>
          <p className="text-slate-400 text-xs leading-relaxed">
            جميع الحقوق محفوظة &copy; {new Date().getFullYear()} - تصميم وتطوير المنصة الذكية وقارئ الملفات BSOM MDOC كحل تشغيل ذكي متكامل بكل سلاسة وبدون تقطيع.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
