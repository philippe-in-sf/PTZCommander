import type { NextFunction, Request, RequestHandler, Response } from "express";
import luscaImport from "lusca";

type Lusca = {
  csrf(options?: {
    angular?: boolean;
    cookie?: {
      options?: {
        httpOnly?: boolean;
        sameSite?: "lax" | "strict" | "none";
        secure?: boolean;
        path?: string;
      };
    };
  }): RequestHandler;
};

const lusca = luscaImport as Lusca;

function csrfCookieSecure() {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

const luscaCsrf = lusca.csrf({
  angular: true,
  cookie: {
    options: {
      httpOnly: false,
      sameSite: "lax",
      secure: csrfCookieSecure(),
      path: "/",
    },
  },
});

export const csrfProtection: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  luscaCsrf(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (/^CSRF token (?:missing|mismatch)$/.test(message)) {
      res.status(403).json({ message });
      return;
    }

    next(error);
  });
};
