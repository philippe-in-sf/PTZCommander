import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Camera, Maximize2, MonitorUp, Radio, RefreshCw, Video, VideoOff } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Camera as CameraType } from "@shared/schema";

interface CameraPreviewProps {
  cameras: CameraType[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  refreshInterval?: number;
  suppressSelectedLivePreview?: boolean;
  persistActivatedPreview?: boolean;
  suspendAllLivePreview?: boolean;
}

type PreviewType = "none" | "snapshot" | "mjpeg" | "rtsp" | "rtp" | "webrtc" | "browser";

function getPreviewType(camera: CameraType): PreviewType {
  return (camera.previewType || (camera.streamUrl ? "snapshot" : "none")) as PreviewType;
}

function previewLabel(type: PreviewType) {
  switch (type) {
    case "snapshot": return "Snapshot";
    case "mjpeg": return "MJPEG";
    case "rtsp": return "RTSP";
    case "rtp": return "RTP";
    case "webrtc": return "WebRTC";
    case "browser": return "USB";
    default: return "No preview";
  }
}

function usePagePreviewActive() {
  const [isPageActive, setIsPageActive] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const update = () => setIsPageActive(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);

    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  return isPageActive;
}

function SnapshotPreview({ camera, refreshInterval, className }: {
  camera: CameraType;
  refreshInterval: number;
  className?: string;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const loadImage = () => {
      if (imgRef.current) {
        imgRef.current.onload = null;
        imgRef.current.onerror = null;
      }

      const url = `/api/cameras/${camera.id}/snapshot?t=${Date.now()}`;
      const img = new Image();
      imgRef.current = img;
      img.onload = () => {
        setImgSrc(url);
        setError(false);
        setLoading(false);
      };
      img.onerror = () => {
        setError(true);
        setLoading(false);
      };
      img.src = url;
    };

    loadImage();
    timerRef.current = setInterval(loadImage, Math.max(250, refreshInterval));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (imgRef.current) {
        imgRef.current.onload = null;
        imgRef.current.onerror = null;
        imgRef.current = null;
      }
    };
  }, [camera.id, refreshInterval]);

  if (imgSrc && !error) {
    return <img src={imgSrc} alt={camera.name} className={cn("w-full h-full object-cover", className)} />;
  }

  return <PreviewState loading={loading} error={error} label="No snapshot" />;
}

function StreamingImagePreview({ camera, className, endpoint, errorLabel, loadingLabel }: {
  camera: CameraType;
  className?: string;
  endpoint: "preview-stream" | "rtsp-stream" | "rtp-stream";
  errorLabel: string;
  loadingLabel: string;
}) {
  const [srcKey, setSrcKey] = useState(Date.now());
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setError(false);
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(timeout);
  }, [camera.id, srcKey]);

  useEffect(() => {
    if (!error) return;

    retryTimerRef.current = setTimeout(() => {
      setError(false);
      setLoading(true);
      setSrcKey(Date.now());
    }, 900);

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [error]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  if (error) {
    return (
      <PreviewState loading label={`${errorLabel} - reconnecting`}>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 text-[10px]"
          onClick={(event) => {
            event.stopPropagation();
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
            setError(false);
            setLoading(true);
            setSrcKey(Date.now());
          }}
        >
          <RefreshCw className="w-3 h-3 mr-1" /> Retry
        </Button>
      </PreviewState>
    );
  }

  return (
    <>
      {loading && <PreviewState loading label={loadingLabel} />}
      <img
        src={`/api/cameras/${camera.id}/${endpoint}?t=${srcKey}`}
        alt={camera.name}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        className={cn("w-full h-full object-cover", loading && "hidden", className)}
      />
    </>
  );
}

function MjpegPreview({ camera, className }: { camera: CameraType; className?: string }) {
  return (
    <StreamingImagePreview
      camera={camera}
      className={className}
      endpoint="preview-stream"
      errorLabel="No MJPEG signal"
      loadingLabel="Opening stream"
    />
  );
}

function RtspPreview({ camera, className }: { camera: CameraType; className?: string }) {
  return (
    <StreamingImagePreview
      camera={camera}
      className={className}
      endpoint="rtsp-stream"
      errorLabel="No RTSP signal"
      loadingLabel="Opening RTSP"
    />
  );
}

function RtpPreview({ camera, className }: { camera: CameraType; className?: string }) {
  return (
    <StreamingImagePreview
      camera={camera}
      className={className}
      endpoint="rtp-stream"
      errorLabel="No RTP signal"
      loadingLabel="Opening RTP"
    />
  );
}

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1800);
    peer.addEventListener("icegatheringstatechange", () => {
      if (peer.iceGatheringState === "complete") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function WebRtcPreview({ camera, className }: { camera: CameraType; className?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let peer: RTCPeerConnection | null = new RTCPeerConnection();
    let cancelled = false;

    async function start() {
      if (!peer) return;
      try {
        setLoading(true);
        setError(null);
        peer.addTransceiver("video", { direction: "recvonly" });
        peer.addTransceiver("audio", { direction: "recvonly" });
        peer.ontrack = (event) => {
          if (cancelled || !videoRef.current) return;
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(() => {});
          setLoading(false);
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await waitForIceGathering(peer);

        const response = await fetch(`/api/cameras/${camera.id}/webrtc/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sdp: peer.localDescription?.sdp || offer.sdp }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.message || "WebRTC bridge rejected the offer");
        }

        await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "WebRTC failed");
          setLoading(false);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      peer?.close();
      peer = null;
      if (videoRef.current?.srcObject) {
        for (const track of (videoRef.current.srcObject as MediaStream).getTracks()) track.stop();
        videoRef.current.srcObject = null;
      }
    };
  }, [camera.id]);

  if (error) return <PreviewState error label={error} />;

  return (
    <>
      {loading && <PreviewState loading label="Connecting WebRTC" />}
      <video ref={videoRef} autoPlay muted playsInline className={cn("w-full h-full object-cover", loading && "hidden", className)} />
    </>
  );
}

function BrowserVideoPreview({ camera, className }: { camera: CameraType; className?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Browser video input is not available");
        }
        setLoading(true);
        setError(null);
        const deviceId = camera.streamUrl?.trim();
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "USB preview failed");
          setLoading(false);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [camera.id, camera.streamUrl]);

  if (error) return <PreviewState error label={error} />;

  return (
    <>
      {loading && <PreviewState loading label="Opening video input" />}
      <video ref={videoRef} autoPlay muted playsInline className={cn("w-full h-full object-cover", loading && "hidden", className)} />
    </>
  );
}

function PreviewMedia({ camera, refreshInterval, className, active = true, streamStartupDelayMs = 0 }: {
  camera: CameraType;
  refreshInterval: number;
  className?: string;
  active?: boolean;
  streamStartupDelayMs?: number;
}) {
  const type = getPreviewType(camera);
  const pagePreviewActive = usePagePreviewActive();
  const livePreviewAllowed = active && pagePreviewActive;
  const isLiveStreamType = type === "mjpeg" || type === "rtsp" || type === "rtp" || type === "webrtc" || type === "browser";
  const [streamReady, setStreamReady] = useState(() => !isLiveStreamType || livePreviewAllowed);

  useEffect(() => {
    if (!isLiveStreamType) {
      setStreamReady(true);
      return;
    }

    if (!livePreviewAllowed) {
      setStreamReady(false);
      return;
    }

    const timeout = setTimeout(() => setStreamReady(true), Math.max(0, streamStartupDelayMs));
    return () => clearTimeout(timeout);
  }, [isLiveStreamType, livePreviewAllowed, streamStartupDelayMs]);

  if (type === "none" || (!camera.streamUrl && type !== "browser")) {
    return <PreviewState label="No preview configured" />;
  }
  if (!pagePreviewActive) {
    return <PreviewState label="Preview paused in background tab" />;
  }
  if (!livePreviewAllowed && type !== "snapshot") {
    return <PreviewState label={`Select for ${previewLabel(type)} preview`} />;
  }
  if (!streamReady && type !== "snapshot") {
    return <PreviewState loading label={`Preparing ${previewLabel(type)} preview`} />;
  }
  if (type === "mjpeg") return <MjpegPreview camera={camera} className={className} />;
  if (type === "rtsp") return <RtspPreview camera={camera} className={className} />;
  if (type === "rtp") return <RtpPreview camera={camera} className={className} />;
  if (type === "webrtc") return <WebRtcPreview camera={camera} className={className} />;
  if (type === "browser") return <BrowserVideoPreview camera={camera} className={className} />;
  return <SnapshotPreview camera={camera} refreshInterval={refreshInterval} className={className} />;
}

function PreviewState({ loading = false, error = false, label, children }: {
  loading?: boolean;
  error?: boolean;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="w-full h-full bg-slate-300 dark:bg-slate-900 flex flex-col items-center justify-center text-center px-3">
      {loading ? (
        <Video className="w-8 h-8 text-slate-600 dark:text-slate-600 animate-pulse" />
      ) : error ? (
        <VideoOff className="w-6 h-6 text-slate-600 dark:text-slate-700" />
      ) : (
        <Camera className="w-6 h-6 text-slate-600 dark:text-slate-700" />
      )}
      <p className="text-[10px] text-slate-600 dark:text-slate-700 mt-1 line-clamp-2">{label}</p>
      {children}
    </div>
  );
}

function CameraFeed({ camera, isSelected, onSelect, refreshInterval, suppressLivePreview, persistActivatedPreview = true, streamStartupDelayMs = 0 }: {
  camera: CameraType;
  isSelected: boolean;
  onSelect: () => void;
  refreshInterval: number;
  suppressLivePreview?: boolean;
  persistActivatedPreview?: boolean;
  streamStartupDelayMs?: number;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [hasActivatedPreview, setHasActivatedPreview] = useState(false);
  const previewType = getPreviewType(camera);
  const hasPreview = previewType !== "none" && (!!camera.streamUrl || previewType === "browser");
  const tallyState = camera.tallyState || (camera.isProgramOutput ? "program" : camera.isPreviewOutput ? "preview" : "off");
  const isPgm = tallyState === "program";
  const isPvw = tallyState === "preview";
  const shouldStreamPreview = persistActivatedPreview
    ? ((hasActivatedPreview || isSelected || fullscreen || isPgm || isPvw) && !suppressLivePreview)
    : (hasPreview && !suppressLivePreview);

  useEffect(() => {
    if (isSelected || fullscreen || isPgm || isPvw) {
      setHasActivatedPreview(true);
    }
  }, [fullscreen, isPgm, isPvw, isSelected]);

  return (
    <>
      <div
        onClick={onSelect}
        className={cn(
          "relative rounded-lg border overflow-hidden cursor-pointer transition-all group aspect-video",
          isPgm
            ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            : isPvw
            ? "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
            : isSelected
            ? "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
            : "border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
        )}
        data-testid={`camera-preview-${camera.id}`}
      >
        <PreviewMedia
          camera={camera}
          refreshInterval={camera.previewRefreshMs || refreshInterval}
          active={shouldStreamPreview}
          streamStartupDelayMs={streamStartupDelayMs}
        />

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/70 to-transparent">
          <span className={cn(
            "text-[10px] font-mono font-bold uppercase tracking-wider",
            isPgm ? "text-red-400" : isPvw ? "text-green-400" : isSelected ? "text-cyan-400" : "text-white/70"
          )}>
            {camera.name}
          </span>
          <div className="flex items-center gap-1">
            {isPgm && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">PGM</span>}
            {isPvw && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white">PVW</span>}
            {isSelected && !isPgm && !isPvw && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-600 text-white">SEL</span>}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
          <span className="text-[9px] font-mono text-white/50">{previewLabel(previewType)} / {camera.ip}</span>
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            camera.status === "online" ? "bg-green-500" : hasPreview ? "bg-amber-400" : "bg-red-800"
          )} />
        </div>

        {hasPreview && (
          <button
            onClick={(event) => { event.stopPropagation(); setFullscreen(true); }}
            className="absolute top-8 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-black/50 text-white/70 hover:text-white"
            data-testid={`camera-fullscreen-${camera.id}`}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden bg-black border-slate-300 dark:border-slate-800">
          <div className="relative aspect-video">
            <PreviewMedia
              camera={camera}
              refreshInterval={camera.previewRefreshMs || refreshInterval}
              active
            />
            <div className="absolute top-3 left-3 text-sm font-mono font-bold text-white bg-black/50 px-2 py-1 rounded">
              {camera.name} / {previewLabel(previewType)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CameraMonitor({ camera, refreshInterval = 2000, className, active = true, streamStartupDelayMs = 0 }: {
  camera: CameraType;
  refreshInterval?: number;
  className?: string;
  active?: boolean;
  streamStartupDelayMs?: number;
}) {
  const previewType = getPreviewType(camera);

  return (
    <div
      className={cn("relative aspect-video overflow-hidden rounded-lg border border-slate-300 dark:border-slate-800 bg-black", className)}
      data-testid={`camera-monitor-${camera.id}`}
    >
      <PreviewMedia
        camera={camera}
        refreshInterval={camera.previewRefreshMs || refreshInterval}
        active={active}
        streamStartupDelayMs={streamStartupDelayMs}
      />
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/70 to-transparent">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/80">{camera.name}</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white/70">{previewLabel(previewType)}</span>
      </div>
    </div>
  );
}

export function CameraPreview({
  cameras,
  selectedId,
  onSelect,
  refreshInterval = 2000,
  suppressSelectedLivePreview = false,
  persistActivatedPreview = true,
  suspendAllLivePreview = false,
}: CameraPreviewProps) {
  return (
    <div className="bg-slate-200/80 dark:bg-slate-900/30 border border-slate-400/50 dark:border-slate-800 rounded-xl p-4">
      <h3 className="text-xs font-mono uppercase text-slate-700 dark:text-slate-500 tracking-widest mb-3 flex items-center gap-2 font-bold">
        <MonitorUp className="w-3 h-3" /> Camera Preview
      </h3>
      <div className={cn(
        "grid gap-3",
        cameras.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"
      )}>
        {cameras.map(camera => (
          <CameraFeed
            key={camera.id}
            camera={camera}
            isSelected={selectedId === camera.id}
            onSelect={() => onSelect(camera.id)}
            refreshInterval={refreshInterval}
            suppressLivePreview={suspendAllLivePreview || (suppressSelectedLivePreview && selectedId === camera.id)}
            persistActivatedPreview={persistActivatedPreview}
            streamStartupDelayMs={(selectedId === camera.id ? 0 : 250) + (Math.max(0, cameras.findIndex((item) => item.id === camera.id)) * 180)}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-500">
        <Radio className="w-3 h-3" />
        Snapshot, MJPEG, RTSP, RTP, WebRTC bridge, and local USB inputs can be set per camera.
      </div>
    </div>
  );
}
