import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Settings, 
  Loader2,
  AlertCircle,
  Wifi,
  Zap,
  ShieldCheck,
  Activity,
  Gauge,
  Server
} from 'lucide-react';

interface HlsPlayerProps {
  src: string;
}

interface QualityLevel {
  height: number;
  bitrate: number;
  index: number;
  name?: string;
  label?: string; // SD, HD, etc.
}

export const HlsPlayer: React.FC<HlsPlayerProps> = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Quality State
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQualityIndex, setCurrentQualityIndex] = useState<number>(-1); // -1 is Auto
  const [showSettings, setShowSettings] = useState(false);

  // Internet Speed & Proxy Optimizer States
  const [speedProfile, setSpeedProfile] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');
  const [proxyServer, setProxyServer] = useState<'corsproxy' | 'allorigins' | 'thingproxy' | 'direct'>('corsproxy');
  const [customBufferLength, setCustomBufferLength] = useState<number>(45); // Default balance of 45 seconds buffering
  const [estimatedSpeed, setEstimatedSpeed] = useState<number | null>(null);
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);

  // Reset error when source is changed
  useEffect(() => {
    setError(null);
  }, [src]);

  // Format bitrate to Mbps
  const formatBitrate = (bitrate: number) => {
    if (!bitrate) return '';
    return (bitrate / 1000000).toFixed(1) + 'M';
  };

  // Safe time duration formatter that won't throw on NaN or Infinity
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
  };

  // Get resolution label
  const getResolutionLabel = (height: number) => {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '2K';
    if (height >= 1080) return 'FHD';
    if (height >= 720) return 'HD';
    return 'SD';
  };

  const getLabelColor = (label?: string) => {
    if (label === '4K' || label === '2K') return 'bg-purple-600';
    if (label === 'FHD') return 'bg-red-600';
    if (label === 'HD') return 'bg-blue-600';
    return 'bg-gray-600';
  };

  // Setup Player
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsBuffering(true);
    setError(null);
    setQualities([]);
    setCurrentQualityIndex(-1);
    setIsLive(false);

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const loadVideo = () => {
      const isHlsSource = src.toLowerCase().includes('.m3u8') || src.toLowerCase().includes('application/vnd.apple.mpegurl');

      // 1. Try HLS.js
      if (isHlsSource && Hls.isSupported()) {
        const hlsConfig: any = {
          enableWorker: false, // Turn off Web Workers inside restricted sandboxed preview iframes
          lowLatencyMode: speedProfile === 'high' || speedProfile === 'auto',
          startLevel: -1, // Auto level selection on start
          // Buffering optimization based on current user selections
          backBufferLength: 90,
          maxBufferLength: customBufferLength, // target buffer size (e.g. 15, 30, 60, 120 seconds)
          maxMaxBufferLength: customBufferLength * 2,
          liveSyncDurationCount: speedProfile === 'low' ? 5 : 3, // Low speed gets more robust buffering
          liveMaxLatencyDurationCount: speedProfile === 'low' ? 15 : 10,
          startFragPrefetch: true, // Auto starts fragment loading instantly
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 4,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 4,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 6,
        };

        // Inject the custom proxy loader to bypass client CORS problems
        if (proxyServer !== 'direct') {
          hlsConfig.loader = class extends (Hls.DefaultConfig.loader as any) {
            constructor(config: any) {
              super(config);
              const originalLoad = this.load.bind(this);
              this.load = function(context: any, configLoader: any, callbacks: any) {
                if (context.url) {
                  const alreadyProxied = context.url.includes('corsproxy.io') || 
                                         context.url.includes('allorigins.win') || 
                                         context.url.includes('thingproxy.freeboard');
                  if (!alreadyProxied) {
                    if (proxyServer === 'corsproxy') {
                      context.url = `https://corsproxy.io/?url=${encodeURIComponent(context.url)}`;
                    } else if (proxyServer === 'allorigins') {
                      context.url = `https://api.allorigins.win/raw?url=${encodeURIComponent(context.url)}`;
                    } else if (proxyServer === 'thingproxy') {
                      context.url = `https://thingproxy.freeboard.io/fetch/${context.url}`;
                    }
                  }
                }
                originalLoad(context, configLoader, callbacks);
              };
            }
          };
        }

        const hls = new Hls(hlsConfig);
        hlsRef.current = hls;

        // Build target stream source using CORS bypass if requested
        let finalSrc = src;
        if (proxyServer === 'corsproxy') {
          finalSrc = `https://corsproxy.io/?url=${encodeURIComponent(src)}`;
        } else if (proxyServer === 'allorigins') {
          finalSrc = `https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`;
        } else if (proxyServer === 'thingproxy') {
          finalSrc = `https://thingproxy.freeboard.io/fetch/${src}`;
        }

        hls.loadSource(finalSrc);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          setIsBuffering(false);
          setIsLive(data.levels.some(level => level.details?.live));
          
          const levels: QualityLevel[] = data.levels.map((level, index) => ({
            height: level.height,
            bitrate: level.bitrate,
            index: index,
            name: level.height ? `${level.height}p` : `L${index}`,
            label: getResolutionLabel(level.height)
          }));
          
          levels.sort((a, b) => b.height - a.height);
          setQualities(levels);

          // Apply adaptive speed cap limitations immediately on manifest payload load
          if (speedProfile === 'low') {
            const lowResolutionLevels = data.levels.filter(l => l.height && l.height <= 480);
            if (lowResolutionLevels.length > 0) {
              const maxL = Math.max(...lowResolutionLevels.map(l => data.levels.indexOf(l)));
              hls.maxAutoLevel = maxL;
            } else {
              hls.maxAutoLevel = 0; // fallback to lowest available
            }
          } else if (speedProfile === 'medium') {
            const mediumResolutionLevels = data.levels.filter(l => l.height && l.height <= 720);
            if (mediumResolutionLevels.length > 0) {
              const maxM = Math.max(...mediumResolutionLevels.map(l => data.levels.indexOf(l)));
              hls.maxAutoLevel = maxM;
            }
          } else {
            hls.maxAutoLevel = -1; // Auto/High gets full bandwidth select
          }
          
          video.play().catch((err) => {
            console.warn("HLS video playback auto-start failed or blocked", err);
            setIsPlaying(false);
            setIsMuted(true);
          });
        });

        // Real-time speed estimator from chunk loaders
        hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
          if (data && data.stats && data.stats.loading && data.stats.total) {
            const durationMs = data.stats.loading.end - data.stats.loading.start;
            if (durationMs > 0) {
              const bits = data.stats.total * 8;
              const speedBps = bits / (durationMs / 1000);
              const speedMbps = speedBps / 1000000;
              if (speedMbps > 0 && speedMbps < 300) {
                setEstimatedSpeed(prev => prev ? (prev * 0.75 + speedMbps * 0.25) : speedMbps);
              }
            }
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (proxyServer === 'direct') {
                  console.warn("Fatal HLS network error detected. Activating CORS Proxy fallback...");
                  setNotification("خطأ اتصال أو حظر CORS! جاري تأمين البث عبر بروكسي فك حظر...");
                  setProxyServer('corsproxy');
                } else {
                  hls.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setError(proxyServer !== 'direct' ? "تعذر تشغيل البث حتى بعد الاستعانة بسيرفر فك الحظر البديل." : "خطأ في الاتصال بالبث");
                break;
            }
          }
        });

      // 2. Try Native HLS (Safari)
      } else if (isHlsSource && video.canPlayType('application/vnd.apple.mpegurl')) {
        let finalSrc = src;
        if (proxyServer === 'corsproxy') {
          finalSrc = `https://corsproxy.io/?url=${encodeURIComponent(src)}`;
        } else if (proxyServer === 'allorigins') {
          finalSrc = `https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`;
        } else if (proxyServer === 'thingproxy') {
          finalSrc = `https://thingproxy.freeboard.io/fetch/${src}`;
        }

        video.src = finalSrc;
        video.addEventListener('loadedmetadata', () => {
          setIsBuffering(false);
          video.play().catch((err) => {
            console.warn("Native Safari HLS autoplay blocked", err);
            setIsMuted(true);
            setIsPlaying(false);
          });
        });
        
      // 3. Fallback to Direct File Playback (MP4, WebM, etc.)
      } else {
        video.src = src;
        try {
          video.load();
        } catch (e) {
          console.error("Direct file loading error", e);
        }
        setQualities([]); 
        
        video.addEventListener('loadeddata', () => {
             setIsBuffering(false);
             video.play().catch((err) => {
               console.warn("Direct file play autoplay blocked", err);
               setIsMuted(true);
               setIsPlaying(false);
             });
        });

        video.addEventListener('error', () => {
          const err = video.error;
          if (err) {
             setError("تعذر تشغيل الملف. تأكد من الصيغة والرابط.");
          }
        });
      }
    };

    loadVideo();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [src, proxyServer, speedProfile, customBufferLength]);

  // Video Event Listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration);
      if (video.duration === Infinity) setIsLive(true);
    };
    
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, []);

  // Controls Visibility
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000) as unknown as number;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
       if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
       controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000) as unknown as number;
    }
  }, [isPlaying]);

  // Actions
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        try {
          videoRef.current.pause();
          setIsPlaying(false);
        } catch (err) {
          console.warn("Pause operation interrupted or failed", err);
        }
      } else {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch((err) => {
          console.warn("Play operation blocked or failed", err);
          setIsPlaying(false);
        });
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const changeQuality = (index: number) => {
    setCurrentQualityIndex(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
    setShowSettings(false);
  };

  const addSafeDelay = () => {
    if (videoRef.current) {
        // Rewind 10 seconds to increase buffer safety margin
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        
        setNotification("تم تأخير البث 10 ثواني لزيادة الاستقرار");
        setTimeout(() => setNotification(null), 3000);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        const promise = containerRef.current.requestFullscreen();
        if (promise && typeof promise.then === 'function') {
          promise.then(() => setIsFullscreen(true)).catch((err) => {
            console.warn("Fullscreen toggle is blocked or unsupported in this sandbox or browser", err);
          });
        } else {
          setIsFullscreen(true);
        }
      } else {
        if (typeof document.exitFullscreen === 'function') {
          const promise = document.exitFullscreen();
          if (promise && typeof promise.then === 'function') {
            promise.then(() => setIsFullscreen(false)).catch((err) => {
              console.warn("Exit fullscreen failed", err);
            });
          } else {
            setIsFullscreen(false);
          }
        }
      }
    } catch (err) {
      console.warn("Browser or frame does not permit fullscreen controls", err);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Current Quality Label for Button
  const currentQualityLabel = () => {
      if (currentQualityIndex === -1) return 'تلقائي';
      const q = qualities.find(x => x.index === currentQualityIndex);
      return q ? q.name : 'HD';
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black group overflow-hidden select-none font-sans"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={() => setShowSettings(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
      />

      {/* Loading Overlay */}
      {isBuffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 pointer-events-none backdrop-blur-[2px]">
          <Loader2 className="w-14 h-14 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 animate-in fade-in zoom-in duration-300">
             <div className="bg-black/80 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4 text-green-500" />
                 <span className="text-sm font-medium">{notification}</span>
             </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30 text-red-500 gap-4 p-4 text-center">
          <AlertCircle className="w-16 h-16 opacity-80" />
          <div className="space-y-2">
             <p className="text-xl font-bold">خطأ في التشغيل</p>
             <p className="text-slate-300 text-sm">{error}</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Controls */}
      <div 
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-4 pt-16 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Internet Speed & Streaming Server Optimizer Panel */}
        {showSpeedPanel && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-[96%] sm:w-[500px] bg-slate-950/95 border border-slate-800 p-4 rounded-2xl shadow-2xl backdrop-blur-md z-45 animate-in fade-in slide-in-from-bottom-5 duration-300 origin-bottom" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-500 animate-pulse" />
                <span className="text-sm font-extrabold text-white">مسرِّع البث ومحسِّن سرعة الإنترنت الذكي</span>
              </div>
              <button 
                onClick={() => setShowSpeedPanel(false)}
                className="text-slate-400 hover:text-white text-xs font-bold bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
              >
                إغلاق
              </button>
            </div>

            {/* Real-time Estimated Speed Indicator */}
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600/10 rounded-lg text-blue-400">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 text-right">معدل سرعة سحب البيانات الحالي للجودة</p>
                  <p className="text-xs font-bold text-slate-200 text-right">
                    {estimatedSpeed 
                      ? `سرعة الاتصال بالسيرفر: ${estimatedSpeed.toFixed(2)} Mbps` 
                      : 'جاري قياس السرعة بدقة أثناء التحميل...'}
                  </p>
                </div>
              </div>
              <div className="flex gap-0.5">
                <div className={`w-1 h-3 rounded-full ${estimatedSpeed && estimatedSpeed > 0 ? 'bg-green-500' : 'bg-slate-700'}`}></div>
                <div className={`w-1 h-4 rounded-full ${estimatedSpeed && estimatedSpeed > 3 ? 'bg-green-500' : 'bg-slate-700'}`}></div>
                <div className={`w-1 h-5 rounded-full ${estimatedSpeed && estimatedSpeed > 8 ? 'bg-green-500' : 'bg-slate-700'}`}></div>
                <div className={`w-1 h-6 rounded-full ${estimatedSpeed && estimatedSpeed > 15 ? 'bg-green-500' : 'bg-slate-700'}`}></div>
              </div>
            </div>

            {/* Mode 1: Quality / Speed Adaptation Profiles */}
            <div className="space-y-2 mb-4">
              <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 justify-start">
                <Gauge className="w-3.5 h-3.5 text-blue-400" />
                <span>ضبط دقة التشغيل التلقائي حسب سرعة شبكتك:</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'auto', title: 'تلقائي ذكي (ABR)', desc: 'توازن سلس حسب السرعة' },
                  { id: 'low', title: 'سرعة ضعيفة (3G/DSL)', desc: 'تحديد الجودة لمنع التقطيع' },
                  { id: 'medium', title: 'سرعة متوسطة (4G)', desc: 'تثبيت الجودة بحد أقصى 720p' },
                  { id: 'high', title: 'سرعة فائقة (5G/ألياف)', desc: 'أقصى جودة ونقل عريض' }
                ].map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setSpeedProfile(profile.id as any);
                      setNotification(`تم تطبيق ملف شبكة: ${profile.title}`);
                      setTimeout(() => setNotification(null), 3000);
                    }}
                    className={`p-2 rounded-xl text-right border transition-all ${
                      speedProfile === profile.id
                        ? 'bg-blue-600/15 border-blue-500 text-blue-400'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-right">{profile.title}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 text-right">{profile.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode 2: Multi Backup CORS bypass servers with high capacity */}
            <div className="space-y-2 mb-4">
              <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 justify-start">
                <Server className="w-3.5 h-3.5 text-orange-400" />
                <span>سيرفر البث البديل وتجاوز حجب مزود الخدمة المحلي:</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'corsproxy', title: 'سيرفر CDN رئيسي', desc: 'وكيل فائق السرعة ذو سعة ضخمة' },
                  { id: 'allorigins', title: 'سيرفر احتياطي مرن', desc: 'تجاوز قيود الاتصال الجغرافي' },
                  { id: 'thingproxy', title: 'سيرفر بديل مستقل', desc: 'خادم ترحيل خارجي مستقر' },
                  { id: 'direct', title: 'اتصال مباشر', desc: 'بدون وسيط (للملفات السريعة)' }
                ].map((svr) => (
                  <button
                    key={svr.id}
                    onClick={() => {
                      setProxyServer(svr.id as any);
                      setNotification(`تم تفعيل: ${svr.title}`);
                      setTimeout(() => setNotification(null), 3000);
                    }}
                    className={`p-2 rounded-xl text-right border transition-all ${
                      proxyServer === svr.id
                        ? 'bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-orange-500 text-orange-400'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-right">{svr.title}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 text-right">{svr.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode 3: Buffer Adjustment Window */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                  <span>طول الذاكرة المؤقتة (Buffer Window size):</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">{customBufferLength} ثانية</span>
              </div>
              <div className="flex gap-2">
                {[
                  { v: 15, l: 'أقل تأخير (15ث)' },
                  { v: 30, l: 'افتراضي (30ث)' },
                  { v: 45, l: 'مستقر وثابث (45ث)' },
                  { v: 90, l: 'حماية كبرى (90ث)' }
                ].map((item) => (
                  <button
                    key={item.v}
                    onClick={() => {
                      setCustomBufferLength(item.v);
                      setNotification(`تعديل الذاكرة المؤقتة: ${item.v} ثانية`);
                      setTimeout(() => setNotification(null), 3000);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                      customBufferLength === item.v 
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {item.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Progress */}
        {!isLive && (
            <div className="w-full mb-4 flex items-center group/progress cursor-pointer relative">
             <input
               type="range"
               min={0}
               max={duration || 100}
               value={currentTime}
               onChange={(e) => {
                 if(videoRef.current) videoRef.current.currentTime = Number(e.target.value);
                 setCurrentTime(Number(e.target.value));
               }}
               className="w-full h-1.5 bg-slate-700/50 rounded-lg appearance-none cursor-pointer z-10
                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full 
                 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(59,130,246,0.5)]
                 hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
             />
             <div 
               className="absolute left-0 top-0 bottom-0 bg-blue-500/30 rounded-l-lg pointer-events-none h-1.5" 
               style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
             />
           </div>
        )}

        <div className="flex items-center justify-between rtl:space-x-reverse dir-rtl">
          
          {/* Right Controls (Play/Vol) */}
          <div className="flex items-center gap-4">
            <button 
              onClick={togglePlay}
              className="text-white hover:text-blue-400 transition-transform active:scale-90 focus:outline-none"
            >
              {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current" />}
            </button>

            <div className="flex items-center gap-3 group/vol">
              <button onClick={toggleMute} className="text-white hover:text-blue-400">
                {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>
              <div className="w-0 overflow-hidden group-hover/vol:w-24 transition-all duration-300">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
            </div>

            {isLive ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-650 rounded-md shadow-lg shadow-red-900/20 animate-pulse">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-xs font-bold uppercase tracking-wider text-white">مباشر</span>
              </div>
            ) : (
                <div className="text-xs font-mono text-slate-300 hidden sm:block">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>
            )}
          </div>

          {/* Left Controls (Quality/Full) */}
          <div className="flex items-center gap-3">
             
             {/* Quality Settings - Only show if adaptive bitrate is available */}
             {qualities.length > 0 && (
                 <>
                   {/* Stability Mode Button (Delay) - Only for Live */}
                   {isLive && (
                     <button
                       onClick={addSafeDelay}
                       className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white/10 border-white/5 text-slate-300 hover:bg-white/20 hover:text-green-400 transition-all group"
                       title="تأخير البث 10 ثواني لزيادة الاستقرار ومنع التقطيع"
                     >
                       <ShieldCheck className="w-4 h-4 group-hover:text-green-400 transition-colors" />
                       <span className="text-xs font-bold hidden sm:inline">ثبات البث</span>
                     </button>
                   )}

                   {/* Auto Speed / Net Speed */}
                   <button
                     onClick={() => changeQuality(-1)}
                     className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                       currentQualityIndex === -1 
                         ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-400 text-white shadow-lg shadow-blue-500/30' 
                         : 'bg-white/10 border-white/5 text-slate-300 hover:bg-white/20'
                     }`}
                     title="تشغيل تلقائي حسب سرعة الانترنت (أسرع خيار)"
                   >
                     {currentQualityIndex === -1 ? <Zap className="w-3 h-3 text-yellow-300 fill-yellow-300 animate-pulse" /> : <Wifi className="w-4 h-4" />}
                     <span className="text-xs font-bold hidden sm:inline">سرعة النت</span>
                   </button>

                   <div className="relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all border border-white/5"
                      title="تغيير الجودة"
                    >
                      <Settings className={`w-4 h-4 text-slate-200 transition-transform duration-500 ${showSettings ? 'rotate-180' : ''}`} />
                      <span className="text-xs font-bold text-white tracking-wide">
                        {currentQualityLabel()}
                      </span>
                    </button>

                    {/* Settings Menu */}
                    {showSettings && (
                      <div className="absolute bottom-full left-0 mb-3 w-56 bg-slate-900/95 border border-slate-700/50 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-4 origin-bottom-left">
                         <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">الجودة المتوفرة</p>
                         </div>
                         <div className="max-h-64 overflow-y-auto scrollbar-hide p-1">
                            <button
                              onClick={() => changeQuality(-1)}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm rounded-lg mb-1 transition-all ${currentQualityIndex === -1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-300 hover:bg-white/10'}`}
                            >
                              <span className="flex items-center gap-2">
                                  <span className="font-bold">تلقائي</span>
                                  <span className="text-[10px] opacity-70">(حسب السرعة)</span>
                              </span>
                              {currentQualityIndex === -1 && <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_white]"></div>}
                            </button>
                            
                            {qualities.map((q) => (
                              <button
                                key={q.index}
                                onClick={() => changeQuality(q.index)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm rounded-lg mb-1 transition-all ${currentQualityIndex === q.index ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-300 hover:bg-white/10'}`}
                              >
                                <div className="flex items-center gap-2">
                                   <span className="font-medium font-mono">{q.name}</span>
                                   <span className={`text-[10px] px-1.5 py-0.5 rounded ${getLabelColor(q.label)} text-white font-bold`}>
                                      {q.label}
                                   </span>
                                </div>
                                {currentQualityIndex === q.index && <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_white]"></div>}
                              </button>
                            ))}
                         </div>
                      </div>
                    )}
                   </div>
                 </>
             )}

             {/* Generic "Standard" Badge if no qualities (MP4) */}
             {qualities.length === 0 && !isLive && (
                 <div className="px-2 py-1 rounded bg-white/5 border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400">Standard</span>
                 </div>
             )}

              {/* Advanced Speed Adaptation and Streaming Proxies */}
              <button
                onClick={() => {
                  setShowSpeedPanel(!showSpeedPanel);
                  setShowSettings(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  showSpeedPanel || speedProfile !== 'auto' || proxyServer !== 'corsproxy'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 border-orange-400 text-white shadow-lg shadow-orange-500/20' 
                    : 'bg-white/10 border-white/5 text-slate-300 hover:bg-white/20 hover:text-orange-400'
                }`}
                title="تجاوز قيود تشغيل البث وحظر CORS للمواقع المقيدة وتعديل سرعة شبكتك"
              >
                <Activity className={`w-4 h-4 ${showSpeedPanel ? 'animate-bounce text-yellow-300' : 'text-orange-400 animate-pulse'}`} />
                <span>ضبط وتسرّيع البث</span>
              </button>

             <button 
                onClick={toggleFullscreen} 
                className="p-2 text-white hover:text-blue-400 transition-colors hover:bg-white/10 rounded-lg"
             >
               {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};