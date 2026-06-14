import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Monitor,
  MonitorPlay,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  DEVICE_SETUP_TYPES,
  buildSetupFinish,
  deviceSetupSupportsDiscovery,
  getDeviceSetupConfig,
  getInitialDeviceSetupStep,
  type DeviceSetupDiscoveryOption,
  type DeviceSetupFinish,
  type DeviceSetupStep,
  type DeviceSetupType,
} from "@shared/device-setup-wizard";
import {
  cameraApi,
  displayApi,
  healthApi,
  hueApi,
  mixerApi,
  obsApi,
  switcherApi,
  type DiscoveredCamera,
  type HisenseDiscoveredDisplay,
  type SamsungDiscoveredDisplay,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Camera as CameraRecord, DisplayDevice, HueBridge, Mixer, ObsConnection, Switcher } from "@shared/schema";

interface DeviceSetupWizardProps {
  open: boolean;
  initialType: DeviceSetupType | null;
  canCreate: boolean;
  onOpenChange: (open: boolean) => void;
}

type SetupMode = "discover" | "manual";
type DisplayDiscoveryVendor = "samsung" | "hisense";
type DisplayDiscoveryResult =
  | { vendor: "samsung"; display: SamsungDiscoveredDisplay }
  | { vendor: "hisense"; display: HisenseDiscoveredDisplay };
type ProgressStatus = "pending" | "running" | "success" | "warning" | "failed";

interface SetupProgressItem {
  id: "created" | "connected" | "verified";
  label: string;
  status: ProgressStatus;
  message?: string;
}

interface DeviceSetupFormState {
  name: string;
  ip: string;
  port: string;
  protocol: string;
  username: string;
  password: string;
  streamUrl: string;
  previewType: "snapshot" | "mjpeg" | "rtsp" | "rtp" | "webrtc" | "browser" | "none";
  previewRefreshMs: string;
  host: string;
  apiKey: string;
  switcherType: string;
  displayBrand: "samsung_frame" | "hisense_canvas" | "display";
  displayProtocol: "samsung_local" | "hisense_vidaa";
  samsungPort: string;
  samsungToken: string;
  hisensePort: string;
  hisenseUseSsl: "true" | "false";
  hisenseUsername: string;
  hisensePassword: string;
  hisenseClientName: string;
  hisenseAuthCode: string;
}

const STEP_LABELS: Record<DeviceSetupStep, string> = {
  type: "Device Type",
  mode: "Discover or Manual",
  details: "Details",
  testing: "Add and Test",
  finish: "Finish",
};

const DEVICE_ICONS: Record<DeviceSetupType, React.ComponentType<{ className?: string }>> = {
  camera: Camera,
  mixer: SlidersHorizontal,
  switcher: MonitorPlay,
  obs: Radio,
  hue: Lightbulb,
  display: Monitor,
};

function defaultName(type: DeviceSetupType | null) {
  switch (type) {
    case "camera":
      return "Camera";
    case "mixer":
      return "X32 Mixer";
    case "switcher":
      return "ATEM Switcher";
    case "obs":
      return "OBS Studio";
    case "hue":
      return "Hue Bridge";
    case "display":
      return "Display";
    default:
      return "";
  }
}

function createDefaultForm(type: DeviceSetupType | null): DeviceSetupFormState {
  return {
    name: defaultName(type),
    ip: "",
    port: type === "mixer" ? "10023" : type === "obs" ? "4455" : type === "camera" ? "52381" : "",
    protocol: "visca",
    username: "",
    password: "",
    streamUrl: "",
    previewType: "snapshot",
    previewRefreshMs: "2000",
    host: "127.0.0.1",
    apiKey: "",
    switcherType: "atem",
    displayBrand: "samsung_frame",
    displayProtocol: "samsung_local",
    samsungPort: "8002",
    samsungToken: "",
    hisensePort: "36669",
    hisenseUseSsl: "true",
    hisenseUsername: "hisenseservice",
    hisensePassword: "multimqttservice",
    hisenseClientName: "PTZCommander",
    hisenseAuthCode: "",
  };
}

function emptyProgress(): SetupProgressItem[] {
  return [
    { id: "created", label: "Created", status: "pending" },
    { id: "connected", label: "Connected or Paired", status: "pending" },
    { id: "verified", label: "Status Verified", status: "pending" },
  ];
}

function fieldValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nullableFieldValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePort(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function StepRail({ current }: { current: DeviceSetupStep }) {
  const steps: DeviceSetupStep[] = ["type", "mode", "details", "testing", "finish"];
  const currentIndex = steps.indexOf(current);

  return (
    <div className="grid grid-cols-5 gap-1">
      {steps.map((step, index) => (
        <div
          key={step}
          className={cn(
            "min-h-9 rounded border px-2 py-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-normal",
            index < currentIndex && "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
            index === currentIndex && "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
            index > currentIndex && "border-border bg-muted/30 text-muted-foreground",
          )}
        >
          {STEP_LABELS[step]}
        </div>
      ))}
    </div>
  );
}

function ProgressIcon({ status }: { status: ProgressStatus }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />;
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-destructive" />;
  return <div className="h-4 w-4 rounded-full border border-muted-foreground/40" />;
}

function ProgressList({ progress }: { progress: SetupProgressItem[] }) {
  return (
    <div className="space-y-2">
      {progress.map((item) => (
        <div key={item.id} className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-3">
          <ProgressIcon status={item.status} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{item.label}</div>
            {item.message && <div className="mt-0.5 text-xs text-muted-foreground">{item.message}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function validateForm(type: DeviceSetupType, form: DeviceSetupFormState) {
  const errors: Record<string, string> = {};
  const requireField = (key: keyof DeviceSetupFormState, label: string) => {
    if (!form[key].trim()) errors[key] = `${label} is required.`;
  };
  const requirePort = (key: keyof DeviceSetupFormState, label: string) => {
    const parsed = Number.parseInt(form[key], 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      errors[key] = `${label} must be between 1 and 65535.`;
    }
  };

  requireField("name", "Name");
  if (type === "camera") {
    requireField("ip", "IP address");
    requirePort("port", "Port");
  }
  if (type === "mixer") {
    requireField("ip", "IP address");
    requirePort("port", "Port");
  }
  if (type === "switcher") {
    requireField("ip", "IP address");
  }
  if (type === "obs") {
    requireField("host", "Host");
    requirePort("port", "Port");
  }
  if (type === "hue") {
    requireField("ip", "Bridge IP");
  }
  if (type === "display") {
    requireField("ip", "IP address");
    if (form.displayProtocol === "samsung_local") {
      requirePort("samsungPort", "Samsung port");
    } else {
      requirePort("hisensePort", "Hisense port");
    }
  }

  return errors;
}

function selectedDisplayName(result: DisplayDiscoveryResult) {
  return result.display.name || `${result.vendor === "samsung" ? "Samsung" : "Hisense"} ${result.display.ip}`;
}

export function DeviceSetupWizard({ open, initialType, canCreate, onOpenChange }: DeviceSetupWizardProps) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [selectedType, setSelectedType] = useState<DeviceSetupType | null>(initialType);
  const [step, setStep] = useState<DeviceSetupStep>(getInitialDeviceSetupStep(initialType));
  const [setupMode, setSetupMode] = useState<SetupMode | null>(null);
  const [form, setForm] = useState<DeviceSetupFormState>(() => createDefaultForm(initialType));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cameraDiscovery, setCameraDiscovery] = useState<DiscoveredCamera[]>([]);
  const [displayDiscovery, setDisplayDiscovery] = useState<DisplayDiscoveryResult[]>([]);
  const [selectedCameraDiscovery, setSelectedCameraDiscovery] = useState<DiscoveredCamera | null>(null);
  const [selectedDisplayDiscovery, setSelectedDisplayDiscovery] = useState<DisplayDiscoveryResult | null>(null);
  const [displayDiscoveryVendor, setDisplayDiscoveryVendor] = useState<DisplayDiscoveryVendor>("samsung");
  const [cameraSubnet, setCameraSubnet] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SetupProgressItem[]>(emptyProgress);
  const [finish, setFinish] = useState<DeviceSetupFinish | null>(null);

  const config = selectedType ? getDeviceSetupConfig(selectedType) : null;
  const title = config ? `Add ${config.label}` : "Add Device";

  const discoveryOptions = useMemo(
    () => selectedType ? getDeviceSetupConfig(selectedType).discoveryOptions : [],
    [selectedType],
  );

  function updateForm(updates: Partial<DeviceSetupFormState>) {
    setForm((current) => ({ ...current, ...updates }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(updates)) delete next[key];
      return next;
    });
  }

  function chooseType(type: DeviceSetupType) {
    setSelectedType(type);
    setForm(createDefaultForm(type));
    setSetupMode(null);
    setErrors({});
    setCameraDiscovery([]);
    setDisplayDiscovery([]);
    setSelectedCameraDiscovery(null);
    setSelectedDisplayDiscovery(null);
    setDiscoveryError(null);
    setFinish(null);
    setProgress(emptyProgress());
    setStep(deviceSetupSupportsDiscovery(type) ? "mode" : "details");
  }

  function goBack() {
    if (step === "mode") {
      if (initialType) {
        onOpenChange(false);
      } else {
        setStep("type");
      }
      return;
    }

    if (step === "details") {
      if (selectedType && deviceSetupSupportsDiscovery(selectedType)) {
        setStep("mode");
      } else if (initialType) {
        onOpenChange(false);
      } else {
        setStep("type");
      }
    }
  }

  function beginManualSetup() {
    setSetupMode("manual");
    setStep("details");
  }

  async function runCameraDiscovery() {
    setDiscovering(true);
    setDiscoveryError(null);
    setCameraDiscovery([]);
    try {
      const result = await cameraApi.discover({
        subnet: fieldValue(cameraSubnet),
      });
      setCameraDiscovery(result.cameras);
    } catch (error) {
      setDiscoveryError(errorMessage(error, "Camera discovery failed"));
    } finally {
      setDiscovering(false);
    }
  }

  async function runDisplayDiscovery() {
    setDiscovering(true);
    setDiscoveryError(null);
    setDisplayDiscovery([]);
    try {
      if (displayDiscoveryVendor === "samsung") {
        const result = await displayApi.discoverSamsung();
        setDisplayDiscovery(result.displays.map((display) => ({ vendor: "samsung", display })));
      } else {
        const result = await displayApi.discoverHisense();
        setDisplayDiscovery(result.displays.map((display) => ({ vendor: "hisense", display })));
      }
    } catch (error) {
      setDiscoveryError(errorMessage(error, "Display discovery failed"));
    } finally {
      setDiscovering(false);
    }
  }

  function useCameraDiscovery(camera: DiscoveredCamera) {
    setSelectedCameraDiscovery(camera);
    updateForm({
      name: camera.name || `Camera ${camera.ip}`,
      ip: camera.ip,
      port: String(camera.port || 52381),
      protocol: "visca",
    });
    setSetupMode("discover");
    setStep("details");
  }

  function useDisplayDiscovery(result: DisplayDiscoveryResult) {
    setSelectedDisplayDiscovery(result);
    if (result.vendor === "samsung") {
      const display = result.display as SamsungDiscoveredDisplay;
      updateForm({
        name: display.name || `Samsung TV ${display.ip}`,
        ip: display.ip,
        displayBrand: "samsung_frame",
        displayProtocol: "samsung_local",
        samsungPort: String(display.port || 8002),
      });
    } else {
      const display = result.display as HisenseDiscoveredDisplay;
      updateForm({
        name: display.name || `Hisense TV ${display.ip}`,
        ip: display.ip,
        displayBrand: "hisense_canvas",
        displayProtocol: "hisense_vidaa",
        hisensePort: String(display.port || 36669),
        hisenseUseSsl: display.useSsl ? "true" : "false",
      });
    }
    setSetupMode("discover");
    setStep("details");
  }

  function setProgressItem(id: SetupProgressItem["id"], status: ProgressStatus, message?: string) {
    setProgress((current) => current.map((item) => item.id === id ? { ...item, status, message } : item));
  }

  function invalidateSetupQueries(type: DeviceSetupType, id?: number) {
    const commonKeys: Record<DeviceSetupType, unknown[][]> = {
      camera: [["cameras"], ["health-devices"]],
      mixer: [["mixers"]],
      switcher: [["switchers"]],
      obs: [["obs"], ["obs-status"], ["obs-scenes"]],
      hue: [["/api/hue/bridges"]],
      display: [["displays"], ["health-devices"]],
    };

    for (const queryKey of commonKeys[type]) {
      queryClient.invalidateQueries({ queryKey });
    }
    if (type === "obs" && id) {
      queryClient.invalidateQueries({ queryKey: ["obs-status", id] });
      queryClient.invalidateQueries({ queryKey: ["obs-scenes", id] });
    }
  }

  async function createCamera() {
    const port = parsePort(form.port, 52381);
    if (selectedCameraDiscovery && setupMode === "discover") {
      const result = await cameraApi.importDiscovered([{
        ip: form.ip.trim(),
        port,
        name: form.name.trim(),
        streamUrl: nullableFieldValue(form.streamUrl),
      }]);
      if (result.added[0]) return result.added[0];
      const skipped = result.skipped[0];
      throw new Error(skipped ? `Camera skipped: ${skipped.reason}` : "Discovered camera was not added");
    }

    return cameraApi.create({
      name: form.name.trim(),
      ip: form.ip.trim(),
      port,
      protocol: "visca",
      username: nullableFieldValue(form.username),
      password: nullableFieldValue(form.password),
      streamUrl: nullableFieldValue(form.streamUrl),
      previewType: form.previewType,
      previewRefreshMs: parsePort(form.previewRefreshMs, 2000),
    });
  }

  async function verifyCamera(camera: CameraRecord) {
    const health = await healthApi.getDevices();
    const match = health.cameras.find((device) => device.id === camera.id || device.ip === camera.ip);
    if (!match) return { ok: false, message: "Camera was created, but health has not reported it yet." };
    if (match.status === "offline") return { ok: false, message: "Camera was created, but health reports it offline." };
    return { ok: true, message: `Health reports ${match.status}.` };
  }

  async function createMixer() {
    return mixerApi.create({
      name: form.name.trim(),
      ip: form.ip.trim(),
      port: parsePort(form.port, 10023),
    });
  }

  async function verifyMixer(mixer: Mixer) {
    const connect = await mixerApi.connect(mixer.id);
    const status = await mixerApi.getStatus(mixer.id);
    if (connect.success === false || !status.connected) {
      return { ok: false, message: connect.status || "Mixer was created, but it did not report connected." };
    }
    return { ok: true, message: "Mixer connected and returned status." };
  }

  async function createSwitcher() {
    return switcherApi.create({
      name: form.name.trim(),
      ip: form.ip.trim(),
      type: form.switcherType || "atem",
    });
  }

  async function verifySwitcher(switcher: Switcher) {
    const connect = await switcherApi.connect(switcher.id);
    await switcherApi.getStatus(switcher.id);
    if (connect.success === false) {
      return { ok: false, message: connect.message || connect.status || "Switcher was created, but connection failed." };
    }
    return { ok: true, message: connect.message || connect.status || "Switcher connected and returned status." };
  }

  async function createObsConnection() {
    return obsApi.create({
      name: form.name.trim(),
      host: form.host.trim(),
      port: parsePort(form.port, 4455),
      password: nullableFieldValue(form.password),
    });
  }

  async function verifyObs(connection: ObsConnection) {
    await obsApi.connect(connection.id);
    const status = await obsApi.getStatus(connection.id);
    const scenes = await obsApi.getScenes(connection.id);
    if (!status.connected) {
      return { ok: false, message: "OBS was created, but WebSocket status is disconnected." };
    }
    return { ok: true, message: `OBS connected; ${scenes.scenes.length} scene${scenes.scenes.length === 1 ? "" : "s"} available.` };
  }

  async function createHueBridge() {
    return hueApi.create({
      name: form.name.trim(),
      ip: form.ip.trim(),
      apiKey: nullableFieldValue(form.apiKey),
    });
  }

  async function verifyHueBridge(bridge: HueBridge) {
    if (form.apiKey.trim()) {
      if (bridge.status === "online") return { ok: true, message: "Hue bridge accepted the API key and is online." };
      return { ok: false, message: "Hue bridge was created, but the saved API key did not verify online." };
    }

    const result = await hueApi.pair(bridge.id);
    return result.success
      ? { ok: true, message: "Hue bridge paired after link-button confirmation." }
      : { ok: false, message: "Hue bridge was created, but pairing did not complete." };
  }

  async function createDisplay() {
    if (form.displayProtocol === "samsung_local") {
      return displayApi.create({
        name: form.name.trim(),
        brand: "samsung_frame",
        ip: form.ip.trim(),
        protocol: "samsung_local",
        samsungPort: parsePort(form.samsungPort, 8002),
        samsungToken: nullableFieldValue(form.samsungToken),
        samsungModel: selectedDisplayDiscovery?.vendor === "samsung" ? selectedDisplayDiscovery.display.modelName ?? null : null,
      });
    }

    return displayApi.create({
      name: form.name.trim(),
      brand: form.displayBrand === "hisense_canvas" ? "hisense_canvas" : "display",
      ip: form.ip.trim(),
      protocol: "hisense_vidaa",
      hisensePort: parsePort(form.hisensePort, 36669),
      hisenseUseSsl: form.hisenseUseSsl === "true",
      hisenseUsername: form.hisenseUsername.trim() || "hisenseservice",
      hisensePassword: form.hisensePassword.trim() || "multimqttservice",
      hisenseClientName: form.hisenseClientName.trim() || "PTZCommander",
      hisenseModel: selectedDisplayDiscovery?.vendor === "hisense" ? selectedDisplayDiscovery.display.modelName ?? null : null,
    });
  }

  async function verifyDisplay(display: DisplayDevice) {
    const messages: string[] = [];
    if (display.protocol === "samsung_local") {
      try {
        await displayApi.pair(display.id);
        messages.push("Pair request sent to Samsung display.");
      } catch (error) {
        messages.push(errorMessage(error, "Samsung pairing did not complete."));
      }
    }

    if (display.protocol === "hisense_vidaa" && form.hisenseAuthCode.trim()) {
      try {
        await displayApi.pair(display.id, { authCode: form.hisenseAuthCode.trim() });
        messages.push("Hisense display accepted the pairing code.");
      } catch (error) {
        messages.push(errorMessage(error, "Hisense pairing did not complete."));
      }
    }

    const refreshed = await displayApi.refresh(display.id);
    if (refreshed.status === "offline") {
      return { ok: false, message: [...messages, "Display refreshed, but status is offline."].join(" ") };
    }
    return { ok: true, message: [...messages, `Display refreshed with ${refreshed.status} status.`].filter(Boolean).join(" ") };
  }

  async function submitSetup() {
    if (!selectedType) return;
    if (!canCreate) {
      setErrors({ permission: "Only admins can add devices." });
      return;
    }

    const validation = validateForm(selectedType, form);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setErrors({});
    setStep("testing");
    setProgress(emptyProgress());
    setFinish(null);

    let createdDevice:
      | CameraRecord
      | Mixer
      | Switcher
      | ObsConnection
      | HueBridge
      | DisplayDevice
      | null = null;
    let testResult = { ok: true, message: "Verification complete." };

    try {
      setProgressItem("created", "running", "Creating device record...");
      if (selectedType === "camera") createdDevice = await createCamera();
      if (selectedType === "mixer") createdDevice = await createMixer();
      if (selectedType === "switcher") createdDevice = await createSwitcher();
      if (selectedType === "obs") createdDevice = await createObsConnection();
      if (selectedType === "hue") createdDevice = await createHueBridge();
      if (selectedType === "display") createdDevice = await createDisplay();

      setProgressItem("created", "success", `${getDeviceSetupConfig(selectedType).label} record created.`);
    } catch (error) {
      const message = errorMessage(error, "Device creation failed.");
      setProgressItem("created", "failed", message);
      setProgressItem("connected", "failed", "Skipped because creation failed.");
      setProgressItem("verified", "failed", "Skipped because creation failed.");
      setFinish(buildSetupFinish({
        type: selectedType,
        name: form.name.trim(),
        created: false,
        createdMessage: message,
        testOk: false,
        testMessage: message,
        details: { ...form },
      }));
      setStep("finish");
      return;
    }

    try {
      setProgressItem("connected", "running", "Running the safest supported connection check...");
      if (selectedType === "camera") testResult = await verifyCamera(createdDevice as CameraRecord);
      if (selectedType === "mixer") testResult = await verifyMixer(createdDevice as Mixer);
      if (selectedType === "switcher") testResult = await verifySwitcher(createdDevice as Switcher);
      if (selectedType === "obs") testResult = await verifyObs(createdDevice as ObsConnection);
      if (selectedType === "hue") testResult = await verifyHueBridge(createdDevice as HueBridge);
      if (selectedType === "display") testResult = await verifyDisplay(createdDevice as DisplayDevice);
      setProgressItem("connected", testResult.ok ? "success" : "warning", testResult.message);
      setProgressItem("verified", testResult.ok ? "success" : "warning", testResult.ok ? "Setup check completed." : "Finish with warning.");
    } catch (error) {
      testResult = { ok: false, message: errorMessage(error, "Verification failed.") };
      setProgressItem("connected", "warning", testResult.message);
      setProgressItem("verified", "warning", "Device exists; finish and inspect it on the device page.");
    }

    invalidateSetupQueries(selectedType, createdDevice?.id);
    setFinish(buildSetupFinish({
      type: selectedType,
      name: "name" in createdDevice! ? createdDevice!.name : form.name.trim(),
      created: true,
      createdMessage: `${getDeviceSetupConfig(selectedType).label} created.`,
      testOk: testResult.ok,
      testMessage: testResult.message,
      details: { ...form },
    }));
    setStep("finish");
  }

  function resetForAnother() {
    setSelectedType(null);
    setForm(createDefaultForm(null));
    setSetupMode(null);
    setErrors({});
    setCameraDiscovery([]);
    setDisplayDiscovery([]);
    setSelectedCameraDiscovery(null);
    setSelectedDisplayDiscovery(null);
    setDiscoveryError(null);
    setProgress(emptyProgress());
    setFinish(null);
    setStep("type");
  }

  function openDestination() {
    if (!config) return;
    onOpenChange(false);
    navigate(config.route);
  }

  function renderTypeStep() {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEVICE_SETUP_TYPES.map((type) => {
          const option = getDeviceSetupConfig(type);
          const Icon = DEVICE_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => chooseType(type)}
              className="flex min-h-28 flex-col items-start justify-between rounded-md border border-border bg-muted/20 p-4 text-left transition-colors hover:border-cyan-500/60 hover:bg-cyan-500/10"
              data-testid={`device-setup-type-${type}`}
            >
              <Icon className="h-5 w-5 text-cyan-500" />
              <span>
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.statusHint}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderCameraDiscovery() {
    return (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={cameraSubnet}
            onChange={(event) => setCameraSubnet(event.target.value)}
            placeholder="Optional subnet, e.g. 192.168.0.0/24"
            data-testid="input-device-setup-camera-subnet"
          />
          <Button onClick={runCameraDiscovery} disabled={discovering} data-testid="button-device-setup-discover-camera">
            {discovering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Discover
          </Button>
        </div>
        {cameraDiscovery.length > 0 && (
          <div className="space-y-2">
            {cameraDiscovery.map((camera) => (
              <div key={`${camera.ip}:${camera.port}`} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{camera.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{camera.ip}:{camera.port} · {camera.confidence}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => useCameraDiscovery(camera)} disabled={camera.alreadyConfigured}>
                  {camera.alreadyConfigured ? "Added" : "Use"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderDisplayDiscovery() {
    return (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <Select value={displayDiscoveryVendor} onValueChange={(value) => setDisplayDiscoveryVendor(value as DisplayDiscoveryVendor)}>
            <SelectTrigger data-testid="select-device-setup-display-discovery">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="samsung">Samsung</SelectItem>
              <SelectItem value="hisense">Hisense</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-md border border-border px-3 text-xs text-muted-foreground">
            {displayDiscoveryVendor === "samsung" ? "Samsung local discovery" : "Hisense VIDAA discovery"}
          </div>
          <Button onClick={runDisplayDiscovery} disabled={discovering} data-testid="button-device-setup-discover-display">
            {discovering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Discover
          </Button>
        </div>
        {displayDiscovery.length > 0 && (
          <div className="space-y-2">
            {displayDiscovery.map((result) => (
              <div key={`${result.vendor}:${result.display.ip}:${result.display.port}`} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{selectedDisplayName(result)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {result.display.ip}:{result.display.port} · {result.vendor}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => useDisplayDiscovery(result)} disabled={result.display.alreadyConfigured}>
                  {result.display.alreadyConfigured ? "Added" : "Use"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderModeStep() {
    if (!selectedType || !config) return null;
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSetupMode("discover")}
            className={cn(
              "rounded-md border p-4 text-left transition-colors",
              setupMode === "discover" ? "border-cyan-500/60 bg-cyan-500/10" : "border-border bg-muted/20 hover:border-cyan-500/40",
            )}
            data-testid="device-setup-mode-discover"
          >
            <Search className="mb-3 h-5 w-5 text-cyan-500" />
            <div className="text-sm font-semibold">Discover on network</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedType === "camera" ? "Search for VISCA cameras." : "Search for Samsung or Hisense displays."}
            </div>
          </button>
          <button
            type="button"
            onClick={beginManualSetup}
            className="rounded-md border border-border bg-muted/20 p-4 text-left transition-colors hover:border-cyan-500/40"
            data-testid="device-setup-mode-manual"
          >
            <Plus className="mb-3 h-5 w-5 text-cyan-500" />
            <div className="text-sm font-semibold">Manual setup</div>
            <div className="mt-1 text-xs text-muted-foreground">Enter the address and credentials yourself.</div>
          </button>
        </div>

        {setupMode === "discover" && (
          <div className="rounded-md border border-border bg-muted/10 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{discoveryOptions.join(", ")}</Badge>
              <span className="text-xs text-muted-foreground">Discovery uses only protocols already supported by PTZ Command.</span>
            </div>
            {selectedType === "camera" ? renderCameraDiscovery() : renderDisplayDiscovery()}
            {discoveryError && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Discovery failed</AlertTitle>
                <AlertDescription>{discoveryError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderCameraFields() {
    return (
      <>
        <Field label="Camera Name" error={errors.name}>
          <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} data-testid="input-device-setup-name" />
        </Field>
        <Field label="IP Address" error={errors.ip}>
          <Input value={form.ip} onChange={(event) => updateForm({ ip: event.target.value })} placeholder="192.168.0.71" data-testid="input-device-setup-ip" />
        </Field>
        <Field label="VISCA Port" error={errors.port}>
          <Input value={form.port} onChange={(event) => updateForm({ port: event.target.value })} inputMode="numeric" data-testid="input-device-setup-port" />
        </Field>
        <Field label="Protocol">
          <Select value={form.protocol} onValueChange={(value) => updateForm({ protocol: value })}>
            <SelectTrigger data-testid="select-device-setup-camera-protocol"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="visca">VISCA</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Username">
          <Input value={form.username} onChange={(event) => updateForm({ username: event.target.value })} autoComplete="off" data-testid="input-device-setup-username" />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(event) => updateForm({ password: event.target.value })} autoComplete="new-password" data-testid="input-device-setup-password" />
        </Field>
        <Field label="Preview Type">
          <Select value={form.previewType} onValueChange={(value) => updateForm({ previewType: value as DeviceSetupFormState["previewType"] })}>
            <SelectTrigger data-testid="select-device-setup-preview-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="snapshot">Snapshot</SelectItem>
              <SelectItem value="mjpeg">MJPEG</SelectItem>
              <SelectItem value="rtsp">RTSP</SelectItem>
              <SelectItem value="rtp">RTP</SelectItem>
              <SelectItem value="webrtc">WebRTC</SelectItem>
              <SelectItem value="browser">Browser</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Preview Refresh Ms">
          <Input value={form.previewRefreshMs} onChange={(event) => updateForm({ previewRefreshMs: event.target.value })} inputMode="numeric" data-testid="input-device-setup-preview-refresh" />
        </Field>
        <Field label="Stream URL" className="sm:col-span-2">
          <Input value={form.streamUrl} onChange={(event) => updateForm({ streamUrl: event.target.value })} placeholder="http://camera/snapshot.jpg" data-testid="input-device-setup-stream-url" />
        </Field>
      </>
    );
  }

  function renderMixerFields() {
    return (
      <>
        <Field label="Mixer Name" error={errors.name}>
          <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} data-testid="input-device-setup-name" />
        </Field>
        <Field label="IP Address" error={errors.ip}>
          <Input value={form.ip} onChange={(event) => updateForm({ ip: event.target.value })} placeholder="192.168.0.50" data-testid="input-device-setup-ip" />
        </Field>
        <Field label="X32 Port" error={errors.port}>
          <Input value={form.port} onChange={(event) => updateForm({ port: event.target.value })} inputMode="numeric" data-testid="input-device-setup-port" />
        </Field>
      </>
    );
  }

  function renderSwitcherFields() {
    return (
      <>
        <Field label="Switcher Name" error={errors.name}>
          <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} data-testid="input-device-setup-name" />
        </Field>
        <Field label="IP Address" error={errors.ip}>
          <Input value={form.ip} onChange={(event) => updateForm({ ip: event.target.value })} placeholder="192.168.0.60" data-testid="input-device-setup-ip" />
        </Field>
        <Field label="Model">
          <Select value={form.switcherType} onValueChange={(value) => updateForm({ switcherType: value })}>
            <SelectTrigger data-testid="select-device-setup-switcher-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="atem">ATEM</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </>
    );
  }

  function renderObsFields() {
    return (
      <>
        <Field label="OBS Name" error={errors.name}>
          <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} data-testid="input-device-setup-name" />
        </Field>
        <Field label="Host" error={errors.host}>
          <Input value={form.host} onChange={(event) => updateForm({ host: event.target.value })} placeholder="127.0.0.1" data-testid="input-device-setup-host" />
        </Field>
        <Field label="WebSocket Port" error={errors.port}>
          <Input value={form.port} onChange={(event) => updateForm({ port: event.target.value })} inputMode="numeric" data-testid="input-device-setup-port" />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(event) => updateForm({ password: event.target.value })} autoComplete="new-password" data-testid="input-device-setup-password" />
        </Field>
      </>
    );
  }

  function renderHueFields() {
    return (
      <>
        <Field label="Bridge Name" error={errors.name}>
          <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} data-testid="input-device-setup-name" />
        </Field>
        <Field label="Bridge IP" error={errors.ip}>
          <Input value={form.ip} onChange={(event) => updateForm({ ip: event.target.value })} placeholder="192.168.0.40" data-testid="input-device-setup-ip" />
        </Field>
        <Field label="API Key" className="sm:col-span-2">
          <Input type="password" value={form.apiKey} onChange={(event) => updateForm({ apiKey: event.target.value })} autoComplete="new-password" placeholder="Leave blank to pair with the link button" data-testid="input-device-setup-api-key" />
        </Field>
        {!form.apiKey.trim() && (
          <Alert className="sm:col-span-2">
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Pairing required</AlertTitle>
            <AlertDescription>
              Press the physical link button on the Hue bridge before Add and Test. If pairing times out, the bridge will still be created with a warning.
            </AlertDescription>
          </Alert>
        )}
      </>
    );
  }

  function renderDisplayFields() {
    return (
      <>
        <Field label="Display Name" error={errors.name}>
          <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} data-testid="input-device-setup-name" />
        </Field>
        <Field label="IP Address" error={errors.ip}>
          <Input value={form.ip} onChange={(event) => updateForm({ ip: event.target.value })} placeholder="192.168.0.80" data-testid="input-device-setup-ip" />
        </Field>
        <Field label="Vendor">
          <Select value={form.displayProtocol} onValueChange={(value) => updateForm({
            displayProtocol: value as DeviceSetupFormState["displayProtocol"],
            displayBrand: value === "hisense_vidaa" ? "hisense_canvas" : "samsung_frame",
          })}>
            <SelectTrigger data-testid="select-device-setup-display-protocol"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="samsung_local">Samsung Local</SelectItem>
              <SelectItem value="hisense_vidaa">Hisense VIDAA</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {form.displayProtocol === "samsung_local" ? (
          <>
            <Field label="Samsung Port" error={errors.samsungPort}>
              <Input value={form.samsungPort} onChange={(event) => updateForm({ samsungPort: event.target.value })} inputMode="numeric" data-testid="input-device-setup-samsung-port" />
            </Field>
            <Field label="Samsung Token" className="sm:col-span-2">
              <Input type="password" value={form.samsungToken} onChange={(event) => updateForm({ samsungToken: event.target.value })} autoComplete="new-password" data-testid="input-device-setup-samsung-token" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Hisense Port" error={errors.hisensePort}>
              <Input value={form.hisensePort} onChange={(event) => updateForm({ hisensePort: event.target.value })} inputMode="numeric" data-testid="input-device-setup-hisense-port" />
            </Field>
            <Field label="Use SSL">
              <Select value={form.hisenseUseSsl} onValueChange={(value) => updateForm({ hisenseUseSsl: value as "true" | "false" })}>
                <SelectTrigger data-testid="select-device-setup-hisense-ssl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Username">
              <Input value={form.hisenseUsername} onChange={(event) => updateForm({ hisenseUsername: event.target.value })} data-testid="input-device-setup-hisense-username" />
            </Field>
            <Field label="Password">
              <Input type="password" value={form.hisensePassword} onChange={(event) => updateForm({ hisensePassword: event.target.value })} autoComplete="new-password" data-testid="input-device-setup-hisense-password" />
            </Field>
            <Field label="Client Name">
              <Input value={form.hisenseClientName} onChange={(event) => updateForm({ hisenseClientName: event.target.value })} data-testid="input-device-setup-hisense-client" />
            </Field>
            <Field label="Pairing Code">
              <Input value={form.hisenseAuthCode} onChange={(event) => updateForm({ hisenseAuthCode: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Optional 4-digit code" data-testid="input-device-setup-hisense-code" />
            </Field>
          </>
        )}
        <Alert className="sm:col-span-2">
          <Monitor className="h-4 w-4" />
          <AlertTitle>SmartThings stays on Displays</AlertTitle>
          <AlertDescription>
            This wizard handles local Samsung and Hisense setup. Use the Displays page for the existing SmartThings cloud flow.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  function renderDetailsStep() {
    if (!selectedType) return null;
    return (
      <div className="space-y-4">
        {!canCreate && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Admin required</AlertTitle>
            <AlertDescription>Adding devices changes station configuration. Sign in as an admin to use this wizard.</AlertDescription>
          </Alert>
        )}
        {errors.permission && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Permission blocked</AlertTitle>
            <AlertDescription>{errors.permission}</AlertDescription>
          </Alert>
        )}
        {(selectedCameraDiscovery || selectedDisplayDiscovery) && (
          <Alert>
            <Search className="h-4 w-4" />
            <AlertTitle>Discovery selected</AlertTitle>
            <AlertDescription>
              Review the discovered details before creating the device.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {selectedType === "camera" && renderCameraFields()}
          {selectedType === "mixer" && renderMixerFields()}
          {selectedType === "switcher" && renderSwitcherFields()}
          {selectedType === "obs" && renderObsFields()}
          {selectedType === "hue" && renderHueFields()}
          {selectedType === "display" && renderDisplayFields()}
        </div>
      </div>
    );
  }

  function renderFinishStep() {
    if (!finish || !config) return null;
    const tone = finish.status === "success" ? "text-emerald-600 dark:text-emerald-300" : finish.status === "warning" ? "text-amber-600 dark:text-amber-300" : "text-destructive";
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-muted/20 p-4">
          <div className={cn("flex items-center gap-2 text-sm font-semibold", tone)}>
            {finish.status === "success" ? <CheckCircle2 className="h-4 w-4" /> : finish.status === "warning" ? <AlertTriangle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {finish.status === "success" ? "Setup complete" : finish.status === "warning" ? "Created with warning" : "Setup failed"}
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Device</span>
              <span className="min-w-0 text-right font-medium">{finish.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{config.label}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Created</span>
              <span className="min-w-0 text-right font-medium">{finish.summary.created}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Check</span>
              <span className="min-w-0 text-right font-medium">{finish.summary.connection}</span>
            </div>
          </div>
          {finish.warning && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>{finish.warning}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  function renderBody() {
    if (step === "type") return renderTypeStep();
    if (step === "mode") return renderModeStep();
    if (step === "details") return renderDetailsStep();
    if (step === "testing") return <ProgressList progress={progress} />;
    if (step === "finish") return renderFinishStep();
    return null;
  }

  function renderFooter() {
    if (step === "type") {
      return (
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      );
    }

    if (step === "mode") {
      return (
        <>
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button variant="secondary" onClick={beginManualSetup}>Manual Setup</Button>
        </>
      );
    }

    if (step === "details") {
      return (
        <>
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={submitSetup} disabled={!canCreate} data-testid="button-device-setup-submit">
            Add and Test
          </Button>
        </>
      );
    }

    if (step === "testing") {
      return (
        <Button variant="outline" disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Working
        </Button>
      );
    }

    return (
      <>
        <Button variant="outline" onClick={resetForAnother} data-testid="button-device-setup-add-another">
          <Plus className="mr-2 h-4 w-4" /> Add another
        </Button>
        <Button onClick={openDestination} data-testid="button-device-setup-open-page">
          <ArrowRight className="mr-2 h-4 w-4" /> Open {config?.label === "Camera" || config?.label === "OBS" ? "Dashboard" : config?.label}
        </Button>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="device-setup-wizard">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {config ? config.statusHint : "Create and verify cameras, production gear, lighting, and displays from one place."}
          </DialogDescription>
        </DialogHeader>

        <StepRail current={step} />
        <Separator />
        {renderBody()}

        <DialogFooter className="gap-2 sm:space-x-0">
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
