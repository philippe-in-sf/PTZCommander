import type { RouteContext } from "./types";
import { insertLayoutSchema, patchLayoutSchema } from "@shared/schema";
import { logger } from "../logger";
import { fromError } from "zod-validation-error";
import { APP_VERSION } from "@shared/version";

export function registerLayoutRoutes(ctx: RouteContext) {
  const { app, storage, broadcast, addSessionLog } = ctx;

  app.get("/api/layouts", async (_req, res) => {
    try {
      const allLayouts = await storage.getAllLayouts();
      res.json(allLayouts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get layouts" });
    }
  });

  app.get("/api/layouts/active", async (_req, res) => {
    try {
      const layout = await storage.getActiveLayout();
      res.json(layout || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to get active layout" });
    }
  });

  app.get("/api/layouts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const layout = await storage.getLayout(id);
      if (!layout) return res.status(404).json({ message: "Layout not found" });
      res.json(layout);
    } catch (error) {
      res.status(500).json({ message: "Failed to get layout" });
    }
  });

  app.post("/api/layouts", async (req, res) => {
    try {
      const parsed = insertLayoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).message });
      }
      const layout = await storage.createLayout(parsed.data);
      logger.info("system", `Layout created: ${layout.name}`, { action: "layout:create" });
      broadcast({ type: "invalidate", keys: ["layouts"] });
      res.status(201).json(layout);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create layout" });
    }
  });

  app.post("/api/layouts/save-current", async (req, res) => {
    try {
      const { name, description, color } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });

      const allCameras = await storage.getAllCameras();
      const allPresets: any[] = [];
      for (const cam of allCameras) {
        const camPresets = await storage.getPresetsForCamera(cam.id);
        allPresets.push(...camPresets);
      }
      const allSceneButtons = await storage.getAllSceneButtons();
      const allMixers = await storage.getAllMixers();
      const allSwitchers = await storage.getAllSwitchers();

      const snapshot = JSON.stringify({
        cameras: allCameras.map(c => ({ name: c.name, ip: c.ip, port: c.port, protocol: c.protocol, username: c.username, password: c.password })),
        presets: allPresets.map(p => ({ cameraIp: allCameras.find(c => c.id === p.cameraId)?.ip, presetNumber: p.presetNumber, name: p.name, pan: p.pan, tilt: p.tilt, zoom: p.zoom, focus: p.focus })),
        sceneButtons: allSceneButtons.map(s => ({ buttonNumber: s.buttonNumber, name: s.name, color: s.color, atemInputId: s.atemInputId, atemTransitionType: s.atemTransitionType, cameraId: s.cameraId, presetNumber: s.presetNumber, mixerActions: s.mixerActions })),
        mixers: allMixers.map(m => ({ name: m.name, ip: m.ip, port: m.port })),
        switchers: allSwitchers.map(s => ({ name: s.name, ip: s.ip, type: s.type })),
      });

      const layout = await storage.createLayout({
        name,
        description: description || null,
        color: color || "#06b6d4",
        snapshot,
      });

      await storage.setActiveLayout(layout.id);

      logger.info("system", `Layout saved from current config: ${name}`, { action: "layout:save_current" });
      broadcast({ type: "invalidate", keys: ["layouts"] });
      res.status(201).json(layout);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to save layout" });
    }
  });

  app.post("/api/layouts/:id/load", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const layout = await storage.getLayout(id);
      if (!layout) return res.status(404).json({ message: "Layout not found" });

      const snapshot = JSON.parse(layout.snapshot);

      const existingCameras = await storage.getAllCameras();
      for (const cam of existingCameras) {
        const camPresets = await storage.getPresetsForCamera(cam.id);
        for (const p of camPresets) await storage.deletePreset(p.id);
        await storage.deleteCamera(cam.id);
      }
      const existingButtons = await storage.getAllSceneButtons();
      for (const btn of existingButtons) await storage.deleteSceneButton(btn.id);
      const existingMixers = await storage.getAllMixers();
      for (const m of existingMixers) await storage.deleteMixer(m.id);
      const existingSwitchers = await storage.getAllSwitchers();
      for (const s of existingSwitchers) await storage.deleteSwitcher(s.id);

      const cameraIdMap: Record<string, number> = {};
      if (snapshot.cameras) {
        for (const cam of snapshot.cameras) {
          try {
            const created = await storage.createCamera(cam);
            cameraIdMap[cam.ip] = created.id;
          } catch {}
        }
      }

      if (snapshot.presets) {
        for (const p of snapshot.presets) {
          const cameraId = p.cameraIp ? cameraIdMap[p.cameraIp] : undefined;
          if (cameraId) {
            try {
              await storage.savePreset({ cameraId, presetNumber: p.presetNumber, name: p.name, pan: p.pan, tilt: p.tilt, zoom: p.zoom, focus: p.focus });
            } catch {}
          }
        }
      }

      if (snapshot.sceneButtons) {
        for (const btn of snapshot.sceneButtons) {
          try {
            await storage.createSceneButton(btn);
          } catch {}
        }
      }

      if (snapshot.mixers) {
        for (const m of snapshot.mixers) {
          try { await storage.createMixer(m); } catch {}
        }
      }

      if (snapshot.switchers) {
        for (const s of snapshot.switchers) {
          try { await storage.createSwitcher(s); } catch {}
        }
      }

      await storage.setActiveLayout(id);

      logger.info("system", `Layout loaded: ${layout.name}`, { action: "layout:load" });
      broadcast({ type: "invalidate", keys: ["layouts", "cameras", "presets", "mixers", "switchers", "scene-buttons"] });
      res.json({ success: true, message: `Layout "${layout.name}" loaded successfully` });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to load layout" });
    }
  });

  app.post("/api/layouts/:id/update-snapshot", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const layout = await storage.getLayout(id);
      if (!layout) return res.status(404).json({ message: "Layout not found" });

      const allCameras = await storage.getAllCameras();
      const allPresets: any[] = [];
      for (const cam of allCameras) {
        const camPresets = await storage.getPresetsForCamera(cam.id);
        allPresets.push(...camPresets);
      }
      const allSceneButtons = await storage.getAllSceneButtons();
      const allMixers = await storage.getAllMixers();
      const allSwitchers = await storage.getAllSwitchers();

      const snapshot = JSON.stringify({
        cameras: allCameras.map(c => ({ name: c.name, ip: c.ip, port: c.port, protocol: c.protocol, username: c.username, password: c.password })),
        presets: allPresets.map(p => ({ cameraIp: allCameras.find(c => c.id === p.cameraId)?.ip, presetNumber: p.presetNumber, name: p.name, pan: p.pan, tilt: p.tilt, zoom: p.zoom, focus: p.focus })),
        sceneButtons: allSceneButtons.map(s => ({ buttonNumber: s.buttonNumber, name: s.name, color: s.color, atemInputId: s.atemInputId, atemTransitionType: s.atemTransitionType, cameraId: s.cameraId, presetNumber: s.presetNumber, mixerActions: s.mixerActions })),
        mixers: allMixers.map(m => ({ name: m.name, ip: m.ip, port: m.port })),
        switchers: allSwitchers.map(s => ({ name: s.name, ip: s.ip, type: s.type })),
      });

      const updated = await storage.updateLayout(id, { snapshot });
      logger.info("system", `Layout snapshot updated: ${layout.name}`, { action: "layout:update_snapshot" });
      broadcast({ type: "invalidate", keys: ["layouts"] });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update layout snapshot" });
    }
  });

  app.patch("/api/layouts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchLayoutSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const layout = await storage.updateLayout(id, result.data);
      if (!layout) return res.status(404).json({ message: "Layout not found" });
      broadcast({ type: "invalidate", keys: ["layouts"] });
      res.json(layout);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update layout";
      res.status(500).json({ message });
    }
  });

  app.delete("/api/layouts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLayout(id);
      logger.info("system", `Layout deleted`, { action: "layout:delete" });
      broadcast({ type: "invalidate", keys: ["layouts"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete layout" });
    }
  });

  app.get("/api/layouts/:id/export", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const layout = await storage.getLayout(id);
      if (!layout) return res.status(404).json({ message: "Layout not found" });

      const exportData = {
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        layout: {
          name: layout.name,
          description: layout.description,
          color: layout.color,
          snapshot: layout.snapshot,
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="layout-${layout.name.replace(/[^a-z0-9]/gi, '_')}.json"`);
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ message: "Failed to export layout" });
    }
  });

  app.post("/api/layouts/import", async (req, res) => {
    try {
      const { layout: importedLayout } = req.body;
      if (!importedLayout || !importedLayout.name || !importedLayout.snapshot) {
        return res.status(400).json({ message: "Invalid layout file — missing name or snapshot data" });
      }

      const created = await storage.createLayout({
        name: importedLayout.name,
        description: importedLayout.description || null,
        color: importedLayout.color || "#06b6d4",
        snapshot: typeof importedLayout.snapshot === "string" ? importedLayout.snapshot : JSON.stringify(importedLayout.snapshot),
      });

      addSessionLog("layout", "Import", `Imported layout: ${created.name}`);
      logger.info("system", `Layout imported: ${created.name}`, { action: "layout:import" });
      broadcast({ type: "invalidate", keys: ["layouts"] });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to import layout" });
    }
  });
}
