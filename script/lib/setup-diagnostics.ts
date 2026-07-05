export const REQUIRED_NODE_MAJOR = 24;

export interface NodeVersionStatus {
  ok: boolean;
  major: number | null;
  version: string;
}

export interface DependencyInput {
  hasNodeModules: boolean;
  hasTsx: boolean;
}

export interface CheckStatus {
  ok: boolean;
  message: string;
}

export interface PortCheckResult {
  port: number;
  available: boolean;
  process?: string;
}

export interface HomebrewNodePackages {
  hasNode: boolean;
  hasNode24: boolean;
}

export function classifyNodeVersion(version: string): NodeVersionStatus {
  const clean = version.trim();
  const major = Number.parseInt(clean.replace(/^v/, "").split(".")[0] || "", 10);
  return {
    ok: major === REQUIRED_NODE_MAJOR,
    major: Number.isFinite(major) ? major : null,
    version: clean,
  };
}

export function describeNodeProblem(status: NodeVersionStatus): string {
  if (status.ok) return `Node.js ${status.version} matches required Node ${REQUIRED_NODE_MAJOR}.x.`;
  const actual = status.major === null ? status.version || "unknown" : `Node ${status.major}`;
  return `PTZ Command requires Node ${REQUIRED_NODE_MAJOR}.x. Current runtime is ${actual}. If Homebrew installed both node and node@24, unlink node and link node@24, or set PTZCOMMAND_NODE_BIN to a Node 24 executable.`;
}

export function parseHomebrewNodePackages(output: string): HomebrewNodePackages {
  const packages = new Set(output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  return {
    hasNode: packages.has("node"),
    hasNode24: packages.has("node@24"),
  };
}

export function describeHomebrewNodeState(packages: HomebrewNodePackages, status: NodeVersionStatus) {
  if (status.ok) return "Homebrew Node links do not need changes.";
  if (packages.hasNode && packages.hasNode24) {
    return "Homebrew has both node and node@24 installed, and node is not currently Node 24. Run: brew unlink node && brew link --overwrite --force node@24";
  }
  if (!packages.hasNode24) {
    return "Homebrew node@24 is not installed. Install Node 24 or set PTZCOMMAND_NODE_BIN to an absolute Node 24 executable.";
  }
  return "Homebrew node@24 is installed but not active. Run: brew link --overwrite --force node@24";
}

export function dependencyStatus(input: DependencyInput): CheckStatus {
  if (input.hasNodeModules && input.hasTsx) {
    return { ok: true, message: "Dependencies are installed." };
  }
  return {
    ok: false,
    message: "Dependencies are not installed. Run npm install, or let setup run it now.",
  };
}

export function ffmpegStatus(hasFfprobe: boolean): CheckStatus {
  if (hasFfprobe) return { ok: true, message: "FFmpeg/FFprobe is available for RTSP previews." };
  return {
    ok: false,
    message: "FFmpeg/FFprobe is missing. Install FFmpeg before using RTSP/RTP camera previews.",
  };
}

export function formatPortConflict(result: PortCheckResult): string {
  if (result.available) return `Port ${result.port} is available.`;
  return `Port ${result.port} is already in use${result.process ? ` by ${result.process}` : ""}.`;
}
