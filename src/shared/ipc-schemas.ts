import { BILIBILI_DOWNLOAD_STAGE_VALUES, BILIBILI_EXPORT_MODE_VALUES } from './bilibiliDownloader'
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
        width: z.number().positive(),
        height: z.number().positive()
    }).optional(),
    windowTitle: z.string().optional(),
    displayId: z.string().optional()
});

export type ScreenRecorderConfig = z.infer<typeof ScreenRecorderConfigSchema>;

export const RecorderBoundsSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive()
});

export const RecorderSelectionPreviewSchema = z.object({
    bounds: RecorderBoundsSchema,
    displayBounds: RecorderBoundsSchema,
    previewDataUrl: z.string().min(1)
});

export const RecorderSessionUpdateSchema = z.object({
    status: z.enum(['idle', 'selecting-area', 'ready-to-record', 'recording', 'finishing']),
    mode: z.enum(['full', 'area']),
    outputPath: z.string(),
    recordingTime: z.string(),
    selectionBounds: RecorderBoundsSchema.nullable(),
    selectionPreviewDataUrl: z.string().nullable(),
    selectedDisplayId: z.string().nullable()
});

export type RecorderBounds = z.infer<typeof RecorderBoundsSchema>;
export type RecorderSelectionPreview = z.infer<typeof RecorderSelectionPreviewSchema>;
export type RecorderSessionUpdate = z.infer<typeof RecorderSessionUpdateSchema>;

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

// Bilibili Downloader Shared Schemas
export const BilibiliPageItemSchema = z.object({
    id: z.string().min(1),
    kind: z.literal('page'),
    title: z.string().min(1),
    page: z.number().int().positive()
});

export const BilibiliEpisodeItemSchema = z.object({
    id: z.string().min(1),
    kind: z.literal('episode'),
    title: z.string().min(1),
    epId: z.string().min(1)
});

export const BilibiliSeasonItemSchema = z.object({
    id: z.string().min(1),
    kind: z.literal('season'),
    title: z.string().min(1),
    seasonId: z.string().min(1)
});

export const BilibiliParsedItemSchema = z.discriminatedUnion('kind', [
    BilibiliPageItemSchema,
    BilibiliEpisodeItemSchema,
    BilibiliSeasonItemSchema
]);

const BilibiliParsedLinkCommonSchema = z.object({
    title: z.string().nullable(),
    coverUrl: z.string().nullable(),
    items: z.array(BilibiliParsedItemSchema).min(1),
    selectedItemId: z.string().min(1)
});

export const BilibiliVideoLinkSchema = BilibiliParsedLinkCommonSchema.extend({
    kind: z.literal('video'),
    bvid: z.string().min(1),
    page: z.number().int().positive().optional()
});

export const BilibiliEpisodeLinkSchema = BilibiliParsedLinkCommonSchema.extend({
    kind: z.literal('episode'),
    epId: z.string().min(1)
});

export const BilibiliSeasonLinkSchema = BilibiliParsedLinkCommonSchema.extend({
    kind: z.literal('season'),
    seasonId: z.string().min(1)
});

export const BilibiliParsedLinkSchema = z.discriminatedUnion('kind', [
    BilibiliVideoLinkSchema,
    BilibiliEpisodeLinkSchema,
    BilibiliSeasonLinkSchema
]).superRefine((value, ctx) => {
    const expectedItemKind = value.kind === 'video' ? 'page' : value.kind === 'episode' ? 'episode' : 'season';

    if (!value.items.every((item) => item.kind === expectedItemKind)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Selectable items must match the link kind'
        });
    }

    if (!value.items.some((item) => item.id === value.selectedItemId)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'selectedItemId must reference one of the items'
        });
    }
});

export const BilibiliDownloaderSelectionSchema = z.object({
    exportMode: z.enum(BILIBILI_EXPORT_MODE_VALUES).nullable()
});

export const BilibiliDownloaderStateSchema = z.object({
    loginSession: z.object({
        isLoggedIn: z.boolean(),
        nickname: z.string().nullable(),
        avatarUrl: z.string().nullable(),
        expiresAt: z.string().nullable()
    }),
    parsedLink: BilibiliParsedLinkSchema.nullable(),
    selection: BilibiliDownloaderSelectionSchema,
    streamOptionSummary: z.object({
        hasAudio: z.boolean(),
        hasVideo: z.boolean(),
        mergeMp4: z.object({
            available: z.boolean(),
            disabledReason: z.string().nullable()
        }),
        exportModes: z.record(z.enum(BILIBILI_EXPORT_MODE_VALUES), z.object({
            available: z.boolean(),
            disabledReason: z.string().nullable()
        })),
        availableExportModes: z.array(z.enum(BILIBILI_EXPORT_MODE_VALUES))
    }).nullable(),
    taskStage: z.enum(BILIBILI_DOWNLOAD_STAGE_VALUES),
    error: z.string().nullable()
});

// Bilibili Downloader Schemas
export const BilibiliParseLinkRequestSchema = z.object({
    link: z.string().min(1)
});

export const BilibiliDownloadRequestSchema = z.object({
    link: z.string().min(1),
    exportMode: z.enum(BILIBILI_EXPORT_MODE_VALUES),
    outputDirectory: z.string().min(1).optional(),
    selectedItemId: z.string().min(1)
});

export type BilibiliParsedItem = z.infer<typeof BilibiliParsedItemSchema>;
export type BilibiliParsedLink = z.infer<typeof BilibiliParsedLinkSchema>;
export type BilibiliDownloaderSelection = z.infer<typeof BilibiliDownloaderSelectionSchema>;
export type BilibiliDownloaderState = z.infer<typeof BilibiliDownloaderStateSchema>;
export type BilibiliParseLinkRequest = z.infer<typeof BilibiliParseLinkRequestSchema>;
export type BilibiliDownloadRequest = z.infer<typeof BilibiliDownloadRequestSchema>;
