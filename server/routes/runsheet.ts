import { insertRunsheetCueSchema, patchRunsheetCueSchema } from "@shared/schema";
import type { RunsheetCue, SceneButton } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import type { RouteContext } from "./types";
import { logger } from "../logger";

const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

type RunsheetCueWithScene = RunsheetCue & { scene: SceneButton | null };

async function withScenes(ctx: RouteContext, cues: RunsheetCue[]): Promise<RunsheetCueWithScene[]> {
  const scenes = await ctx.storage.getAllSceneButtons();
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  return cues.map((cue) => ({ ...cue, scene: sceneById.get(cue.sceneButtonId) || null }));
}

export function registerRunsheetRoutes(ctx: RouteContext) {
  const { app, storage, broadcast } = ctx;

  app.get("/api/runsheet/cues", async (_req, res) => {
    try {
      const cues = await storage.getAllRunsheetCues();
      res.json(await withScenes(ctx, cues));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get runsheet cues" });
    }
  });

  app.post("/api/runsheet/cues", async (req, res) => {
    try {
      const parsed = insertRunsheetCueSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });
      const scene = await storage.getSceneButton(parsed.data.sceneButtonId);
      if (!scene) return res.status(404).json({ message: "Scene not found" });

      const existing = await storage.getAllRunsheetCues();
      const cue = await storage.createRunsheetCue({
        ...parsed.data,
        sortOrder: parsed.data.sortOrder ?? existing.length,
      });
      logger.info("system", `Runsheet cue added: ${scene.name}`, { action: "runsheet:create", details: { cueId: cue.id, sceneButtonId: scene.id } });
      broadcast({ type: "invalidate", keys: ["runsheet-cues"] });
      res.status(201).json((await withScenes(ctx, [cue]))[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create runsheet cue" });
    }
  });

  app.patch("/api/runsheet/cues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parsed = patchRunsheetCueSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });
      if (parsed.data.sceneButtonId !== undefined) {
        const scene = await storage.getSceneButton(parsed.data.sceneButtonId);
        if (!scene) return res.status(404).json({ message: "Scene not found" });
      }

      const cue = await storage.updateRunsheetCue(id, parsed.data);
      if (!cue) return res.status(404).json({ message: "Runsheet cue not found" });
      broadcast({ type: "invalidate", keys: ["runsheet-cues"] });
      res.json((await withScenes(ctx, [cue]))[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update runsheet cue" });
    }
  });

  app.delete("/api/runsheet/cues/:id", async (req, res) => {
    try {
      await storage.deleteRunsheetCue(parseInt(req.params.id));
      broadcast({ type: "invalidate", keys: ["runsheet-cues"] });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete runsheet cue" });
    }
  });

  app.put("/api/runsheet/cues/reorder", async (req, res) => {
    try {
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });
      const existingIds = new Set((await storage.getAllRunsheetCues()).map((cue) => cue.id));
      if (parsed.data.ids.some((id) => !existingIds.has(id))) {
        return res.status(400).json({ message: "Runsheet reorder includes an unknown cue" });
      }
      const cues = await storage.reorderRunsheetCues(parsed.data.ids);
      broadcast({ type: "invalidate", keys: ["runsheet-cues"] });
      res.json(await withScenes(ctx, cues));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to reorder runsheet cues" });
    }
  });
}
