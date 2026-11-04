// The schemas the admin form and the commands share (client and server validate alike).

import { z } from 'zod';
import type { TemplateId, Uuid, Version } from '@/core/brand';
import { TEMPLATE_KIND_VALUES, TEMPLATE_LEVEL_VALUES } from './levels';

export const MAX_CONTENT_CHARS = 200_000;

/** A code is optional: nine built-ins have none (m3 B11). */
export const templateDraftSchema = z.object({
  level: z.enum(TEMPLATE_LEVEL_VALUES, { error: 'Chọn nhóm quy trình' }),
  code: z.string().trim().max(40, 'Mã hiệu tối đa 40 ký tự'),
  title: z.string().trim().min(1, 'Nhập tên biểu mẫu chuẩn').max(300, 'Tên biểu mẫu tối đa 300 ký tự'),
  kind: z.enum(TEMPLATE_KIND_VALUES, { error: 'Chọn định dạng biểu mẫu' }),
  description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự'),
  content: z.string().min(1, 'Nội dung biểu mẫu không được để trống').max(MAX_CONTENT_CHARS, 'Nội dung biểu mẫu quá dài'),
});

export const templateIdSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/, 'Mã biểu mẫu không hợp lệ').transform((v) => v as TemplateId);
export const customIdSchema = z.uuid({ error: 'Mã biểu mẫu không hợp lệ' }).transform((v) => v.toLowerCase() as Uuid<'Template'> & TemplateId);
export const versionSchema = z.number().int().min(1).transform((v) => v as Version);
