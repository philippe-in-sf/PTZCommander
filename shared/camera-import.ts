export interface ExistingCameraAssignment {
  name: string;
}

export interface DiscoveredCameraImportCandidate {
  ip: string;
  port: number;
  name?: string | null;
  streamUrl?: string | null;
  alreadyConfigured?: boolean;
}

export type CameraImportAssignments = Record<string, number>;

export interface CameraImportPayloadItem {
  ip: string;
  port: number;
  name: string;
  streamUrl: string | null;
}

const CAMERA_ASSIGNMENT_NAME_RE = /^Camera\s+(\d+)$/i;

export function getDiscoveredCameraImportKey(camera: Pick<DiscoveredCameraImportCandidate, "ip" | "port">) {
  return `${camera.ip}:${camera.port}`;
}

export function getCameraAssignmentNumberFromName(name: string | null | undefined) {
  const match = name?.trim().match(CAMERA_ASSIGNMENT_NAME_RE);
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function formatCameraAssignmentName(assignment: number) {
  return `Camera ${assignment}`;
}

export function atemInputIdForCameraAssignment(
  assignment: number | null,
  manualAtemInputId: number | null,
) {
  return assignment ?? manualAtemInputId;
}

function compareCameraAssignmentNames(aName: string, bName: string) {
  const aAssignment = getCameraAssignmentNumberFromName(aName);
  const bAssignment = getCameraAssignmentNumberFromName(bName);

  if (aAssignment && bAssignment && aAssignment !== bAssignment) return aAssignment - bAssignment;
  if (aAssignment && !bAssignment) return -1;
  if (!aAssignment && bAssignment) return 1;

  return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" });
}

export function sortCamerasByAssignmentName<T extends { name: string }>(cameras: readonly T[]) {
  return [...cameras].sort((a, b) => compareCameraAssignmentNames(a.name, b.name));
}

function nextAvailableCameraAssignment(usedAssignments: Set<number>) {
  let assignment = 1;
  while (usedAssignments.has(assignment)) assignment += 1;
  return assignment;
}

export function buildDefaultCameraImportAssignments(
  existingCameras: ExistingCameraAssignment[],
  discoveredCameras: DiscoveredCameraImportCandidate[],
): CameraImportAssignments {
  const usedAssignments = new Set<number>();
  for (const camera of existingCameras) {
    const assignment = getCameraAssignmentNumberFromName(camera.name);
    if (assignment) usedAssignments.add(assignment);
  }

  const assignments: CameraImportAssignments = {};
  for (const camera of discoveredCameras) {
    if (camera.alreadyConfigured) continue;

    const assignment = nextAvailableCameraAssignment(usedAssignments);
    usedAssignments.add(assignment);
    assignments[getDiscoveredCameraImportKey(camera)] = assignment;
  }

  return assignments;
}

function normalizeAssignment(value: number | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export function findDuplicateCameraImportAssignments(
  selectedCameras: DiscoveredCameraImportCandidate[],
  assignments: CameraImportAssignments,
) {
  const counts = new Map<number, number>();

  for (const camera of selectedCameras) {
    if (camera.alreadyConfigured) continue;

    const assignment = normalizeAssignment(assignments[getDiscoveredCameraImportKey(camera)]);
    if (!assignment) continue;
    counts.set(assignment, (counts.get(assignment) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([assignment]) => assignment)
    .sort((a, b) => a - b);
}

export function buildDiscoveredCameraImportPayload(
  selectedCameras: DiscoveredCameraImportCandidate[],
  assignments: CameraImportAssignments,
): CameraImportPayloadItem[] {
  return selectedCameras
    .filter((camera) => !camera.alreadyConfigured)
    .map((camera) => {
      const assignment = normalizeAssignment(assignments[getDiscoveredCameraImportKey(camera)]);
      return {
        camera,
        assignment,
        name: assignment ? formatCameraAssignmentName(assignment) : camera.name?.trim() || `Camera ${camera.ip}`,
      };
    })
    .sort((a, b) => {
      if (a.assignment && b.assignment) return a.assignment - b.assignment;
      if (a.assignment) return -1;
      if (b.assignment) return 1;
      return a.camera.ip.localeCompare(b.camera.ip, undefined, { numeric: true });
    })
    .map(({ camera, name }) => ({
      ip: camera.ip,
      port: camera.port,
      name,
      streamUrl: camera.streamUrl || null,
    }));
}
