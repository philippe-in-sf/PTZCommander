const viteEnv = import.meta.env ?? {};

export const DEFAULT_OBS_HOST = viteEnv.VITE_DEFAULT_OBS_HOST || "127.0.0.1";
export const DEFAULT_CAMERA_WHEP_URL =
  viteEnv.VITE_DEFAULT_CAMERA_WHEP_URL || "http://127.0.0.1:8080/camera/whep";
