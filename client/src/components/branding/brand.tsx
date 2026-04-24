import { APP_VERSION } from "@shared/version";
import ptzCommandLogoDark from "@/assets/ptzcommand-logo-dark.png";
import ptzCommandLogoLight from "@/assets/ptzcommand-logo-light.png";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  alt?: string;
}

export function BrandLogo({
  className,
  imageClassName,
  alt = "PTZ Command",
}: BrandLogoProps) {
  return (
    <div className={cn("flex items-center", className)}>
      <img
        src={ptzCommandLogoLight}
        alt={alt}
        className={cn("h-10 w-auto object-contain select-none dark:hidden", imageClassName)}
        draggable={false}
      />
      <img
        src={ptzCommandLogoDark}
        alt={alt}
        className={cn("hidden h-10 w-auto object-contain select-none dark:block", imageClassName)}
        draggable={false}
      />
    </div>
  );
}

interface BrandLockupProps extends BrandLogoProps {
  caption?: string;
  versionClassName?: string;
  captionClassName?: string;
  centered?: boolean;
  showVersion?: boolean;
}

export function BrandLockup({
  className,
  imageClassName,
  caption,
  versionClassName,
  captionClassName,
  centered = false,
  showVersion = false,
}: BrandLockupProps) {
  return (
    <div className={cn("flex flex-col gap-1", centered && "items-center text-center", className)}>
      <BrandLogo imageClassName={imageClassName} />
      {(showVersion || caption) && (
        <div className={cn("flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.32em]", centered && "justify-center")}>
          {caption && (
            <span className={cn("text-slate-500 dark:text-slate-400", captionClassName)}>
              {caption}
            </span>
          )}
          {showVersion && (
            <span className={cn("text-cyan-500/80 dark:text-cyan-400/80", versionClassName)}>
              v{APP_VERSION}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface BrandWatermarkProps {
  className?: string;
}

export function BrandWatermark({ className }: BrandWatermarkProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-5 right-5 hidden select-none opacity-[0.08] blur-[0.2px] xl:block",
        className,
      )}
      aria-hidden="true"
    >
      <BrandLogo imageClassName="h-20 w-auto object-contain" />
    </div>
  );
}

interface StartupSplashProps {
  className?: string;
  label?: string;
  detail?: string;
  overlay?: boolean;
}

export function StartupSplash({
  className,
  label = "Initializing PTZ Command",
  detail = "Audio, video, and lighting control coming online",
  overlay = false,
}: StartupSplashProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7fb] px-6 text-slate-900 dark:bg-[#05070d] dark:text-white",
        overlay && "fixed inset-0 z-[300]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_38%),radial-gradient(circle_at_72%_22%,_rgba(147,51,234,0.14),_transparent_28%),radial-gradient(circle_at_80%_72%,_rgba(250,204,21,0.12),_transparent_22%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_38%),radial-gradient(circle_at_72%_22%,_rgba(147,51,234,0.18),_transparent_28%),radial-gradient(circle_at_80%_72%,_rgba(250,204,21,0.16),_transparent_22%)]" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-white via-white/70 to-transparent dark:from-black dark:via-black/70 dark:to-transparent" />

      <div className="relative z-10 flex max-w-3xl flex-col items-center gap-6 text-center">
        <BrandLockup
          centered
          showVersion
          caption="Audio | Video | Lighting"
          imageClassName="h-48 w-auto max-w-[min(84vw,720px)] object-contain drop-shadow-[0_0_40px_rgba(37,99,235,0.22)]"
          captionClassName="text-slate-500 dark:text-slate-300"
          versionClassName="text-cyan-600 dark:text-cyan-300"
        />
        <div className="space-y-2">
          <p className="text-xl font-semibold tracking-[0.08em] text-slate-900/95 dark:text-white/95 sm:text-2xl">
            {label}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300 sm:text-base">{detail}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)] animate-pulse" />
          <span className="h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.9)] animate-pulse [animation-delay:180ms]" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(253,224,71,0.9)] animate-pulse [animation-delay:360ms]" />
        </div>
      </div>
    </div>
  );
}
