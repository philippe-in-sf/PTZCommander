/**
 * Resolve the HTTP bind address.
 *
 * Defaults to loopback so a casual `npm run dev` / `npm start` does not expose
 * the control plane on every interface. Opt into LAN exposure explicitly with
 * PTZ_HOST/HOST or PTZ_BIND_ALL=true. Replit keeps the previous all-interfaces
 * default via REPL_ID.
 */
export function resolveListenHost(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.PTZ_HOST || env.HOST || "").trim();
  if (explicit) return explicit;

  const bindAll = (env.PTZ_BIND_ALL || "").trim().toLowerCase();
  if (bindAll === "1" || bindAll === "true" || bindAll === "yes") {
    return "0.0.0.0";
  }

  if (env.REPL_ID) return "0.0.0.0";
  return "127.0.0.1";
}
