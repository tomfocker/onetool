import { z } from 'zod';

// Screen Recorder Config Schema
export const ScreenRecorderConfigSchema = z.object({
    outputPath: z.string().min(1),
    format: z.string().min(1),
    fps: z.number().int().positive().optional(),
    quality: z.string().optional(),
    bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
    }).optional(),
    windowTitle: z.string().optional(),
    displayId: z.string().optional()
});

export type ScreenRecorderConfig = z.infer<typeof ScreenRecorderConfigSchema>;

// Auto Clicker Config Schema
export const AutoClickerConfigSchema = z.object({
    interval: z.number().int().positive(),
    button: z.enum(['left', 'right', 'middle'])
});

export type AutoClickerConfig = z.infer<typeof AutoClickerConfigSchema>;

// Web Activator Config Schemas
export const WebActivatorToggleSchema = z.object({
    type: z.enum(['app', 'tab']),
    pattern: z.string().min(1),
    id: z.number().optional()
});

export const WebActivatorShortcutSchema = z.object({
    id: z.string(),
    type: z.enum(['app', 'tab']),
    pattern: z.string().min(1),
    shortcut: z.string().min(1),
    hwnd: z.number().optional()
});

// Rename Files Schema
export const RenameFilesSchema = z.object({
    files: z.array(z.string()),
    mode: z.string(),
    options: z.any() // Can be refined further based on the mode
});

// Quick Installer Schema
export const InstallSoftwareSchema = z.array(z.object({
    id: z.string(),
    name: z.string(),
    source: z.string()
}));

// Screenshot Schema
export const ScreenshotSettingsSchema = z.object({
    savePath: z.string(),
    autoSave: z.boolean()
});

export const ScreenshotCaptureSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
});

// Network Schema
export const NetPingSchema = z.string().min(1);
export const NetScanSchema = z.string().min(1);

// Floatball Schema
export const FloatBallMoveSchema = z.object({
    x: z.number(),
    y: z.number()
});

export const FloatBallResizeSchema = z.object({
    width: z.number().positive(),
    height: z.number().positive()
});
