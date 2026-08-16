import { useEffect, useMemo, useRef, useState } from "react";
import { MonitorUp, Settings2, Video, VideoOff } from "lucide-react";
import {
  ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM,
  atemMultiviewVideoStyle,
  atemTwoPlusEightWindowCrop,
  type AtemMultiviewCrop,
} from "@shared/atem-multiview";
import { useAtemControl, type AtemInput } from "@/hooks/use-atem-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ptz.atemMultiview.videoDeviceId";

function savedDeviceId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

function inputName(input: AtemInput) {
  const longName = input.longName?.trim();
  const shortName = input.shortName?.trim();
  return longName || shortName || `Input ${input.inputId}`;
}

function CroppedInputVideo({ stream, crop }: { stream: MediaStream; crop: AtemMultiviewCrop }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const style = useMemo(
    () => atemMultiviewVideoStyle(crop),
    [crop],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="pointer-events-none absolute max-w-none object-fill"
      style={style}
    />
  );
}

export function AtemMultiview() {
  const { atemState, displayInputs } = useAtemControl();
  const [deviceId, setDeviceId] = useState(savedDeviceId);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [draftDeviceId, setDraftDeviceId] = useState(deviceId);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const inputs = useMemo(() => Array.from({ length: 8 }, (_, index) => {
    const inputId = index + 1;
    return displayInputs.find((input) => input.inputId === inputId) || {
      inputId,
      shortName: `Input ${inputId}`,
      longName: `Input ${inputId}`,
    };
  }), [displayInputs]);

  useEffect(() => {
    if (!deviceId) {
      setStream(null);
      setCaptureError(null);
      return;
    }

    let capture: MediaStream | null = null;
    let cancelled = false;
    setCaptureError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setStream(null);
      setCaptureError("Browser video capture is not available");
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    }).then((nextStream) => {
      if (cancelled) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      capture = nextStream;
      setStream(nextStream);
    }).catch((error: Error) => {
      if (!cancelled) {
        setStream(null);
        setCaptureError(error.message || "Could not open the Multiview capture device");
      }
    });

    return () => {
      cancelled = true;
      capture?.getTracks().forEach((track) => track.stop());
      setStream(null);
    };
  }, [deviceId]);

  async function loadDevices() {
    setLoadingDevices(true);
    setCaptureError(null);
    let permissionStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
        throw new Error("Browser video capture is not available");
      }
      permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const nextDevices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "videoinput");
      setDevices(nextDevices);
      if (!draftDeviceId && nextDevices[0]) setDraftDeviceId(nextDevices[0].deviceId);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Could not list video capture devices");
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
      setLoadingDevices(false);
    }
  }

  function openSettings() {
    setDraftDeviceId(deviceId);
    setSettingsOpen(true);
    void loadDevices();
  }

  function saveSettings() {
    if (draftDeviceId) window.localStorage.setItem(STORAGE_KEY, draftDeviceId);
    else window.localStorage.removeItem(STORAGE_KEY);
    setDeviceId(draftDeviceId);
    setSettingsOpen(false);
  }

  return (
    <section className="rounded-xl border border-slate-400/50 bg-slate-200/80 p-4 dark:border-slate-800 dark:bg-slate-900/30" data-testid="atem-multiview">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-slate-700 dark:text-slate-500">
          <MonitorUp className="h-3 w-3" /> ATEM Multiview
        </h3>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openSettings} data-testid="button-configure-atem-multiview">
          <Settings2 className="mr-1 h-3.5 w-3.5" /> {deviceId ? "Capture Settings" : "Choose Capture Device"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {inputs.map((input, index) => {
          const isProgram = atemState.programInput === input.inputId;
          const isPreview = atemState.previewInput === input.inputId;
          const windowIndex = atemState.multiview?.windows.find((window) => window.source === input.inputId)?.windowIndex ?? index;
          const multiviewLayout = atemState.multiview?.layout ?? ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM;
          const crop = atemTwoPlusEightWindowCrop(multiviewLayout, windowIndex);
          return (
            <div
              key={input.inputId}
              className={cn(
                "relative aspect-video overflow-hidden rounded-md border bg-slate-950",
                isProgram ? "border-red-500 ring-1 ring-red-500/70" : isPreview ? "border-green-500 ring-1 ring-green-500/70" : "border-slate-700",
              )}
              data-testid={`atem-multiview-input-${input.inputId}`}
            >
              {stream && crop ? (
                <CroppedInputVideo stream={stream} crop={crop} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                  {captureError ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  <span className="mt-1 max-w-[90%] truncate text-[10px]">
                    {captureError || (crop ? "Choose Multiview capture" : `Unsupported Multiview layout ${multiviewLayout}`)}
                  </span>
                </div>
              )}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/85 to-transparent px-2 py-1.5 text-white">
                <span className="truncate text-[10px] font-mono font-bold uppercase tracking-wider">{input.inputId}. {inputName(input)}</span>
                <span className={cn(
                  "ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold",
                  isProgram ? "bg-red-600" : isPreview ? "bg-green-600" : "bg-black/50 text-slate-300",
                )}>{isProgram ? "PGM" : isPreview ? "PVW" : "IN"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-slate-500">
        Crops follow the Multiview layout and window assignments reported by the connected ATEM. Capture selection is saved in this browser.
      </p>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ATEM Multiview Capture</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Connect the ATEM Multiview HDMI output to a USB capture device, then select that device below.
            </p>
            <div>
              <Label htmlFor="atem-multiview-device">Video Capture Device</Label>
              <select
                id="atem-multiview-device"
                value={draftDeviceId}
                onChange={(event) => setDraftDeviceId(event.target.value)}
                disabled={loadingDevices}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-atem-multiview-device"
              >
                <option value="">Disabled</option>
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label || `Video input ${index + 1}`}</option>
                ))}
              </select>
            </div>
            {captureError && <p className="text-sm text-red-500">{captureError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button onClick={saveSettings} disabled={loadingDevices}>{loadingDevices ? "Loading Devices..." : "Save Capture"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
