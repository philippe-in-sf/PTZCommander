export function diagnosticsBundleFilename(version: string, generatedAt: string) {
  const safeTimestamp = generatedAt.replace(/\.\d{3}Z$/, "").replace(/:/g, "-");
  return `ptz-command-diagnostics-v${version}-${safeTimestamp}.json`;
}
