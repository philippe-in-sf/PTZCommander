declare module "lusca" {
  import type { RequestHandler } from "express";

  type CsrfCookieOptions = {
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
    path?: string;
  };

  type CsrfOptions = {
    angular?: boolean;
    cookie?: {
      options?: CsrfCookieOptions;
    };
  };

  const lusca: {
    csrf(options?: CsrfOptions): RequestHandler;
  };

  export default lusca;
}
