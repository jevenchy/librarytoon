import { z } from "zod";

export const searchPayloadSchema = z.object({
  query: z.string().min(1).max(200)
});

export const chaptersPayloadSchema = z.object({
  titleId: z.string().min(1)
});

export const pagesPayloadSchema = z.object({
  chapterId: z.string().min(1)
});

export const titleInfoPayloadSchema = z.object({
  titleId: z.string().min(1)
});

export const readRangePayloadSchema = z.object({
  titleId: z.string().min(1),
  chapterStart: z.number().int().nonnegative(),
  chapterEnd: z.number().int().nonnegative()
});

export const apiRequestSchema = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    sourceId: z.string().min(1),
    payload
  });
