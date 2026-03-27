import type { Camera, Preset } from "@shared/schema";
import type { PTZWebSocket } from "@/lib/websocket";

export interface DashboardSkinProps {
  cameras: Camera[];
  presets: Preset[];
  selectedCameraId: number | null;
  onSelectCamera: (id: number) => void;
  onRecallPreset: (index: number) => void;
  onStorePreset: (index: number) => void;
  onJoystickMove: (x: number, y: number) => void;
  onJoystickStop: () => void;
  onZoom: (value: number) => void;
  onFocusAuto: () => void;
  selectedCamera: Camera | undefined;
  ws: PTZWebSocket;
}
