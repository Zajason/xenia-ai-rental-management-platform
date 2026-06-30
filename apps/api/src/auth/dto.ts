import { z } from 'zod';
import { ROLES } from '@xenia/shared';

/** All request bodies validated with zod (see ZodValidationPipe). */

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200).optional(),
  orgName: z.string().min(2).max(120),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Required only when the user belongs to more than one organization. */
  orgSlug: z.string().min(1).optional(),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutDto = z.infer<typeof logoutSchema>;

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
});
export type InviteDto = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200).optional(),
});
export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;

export const magicLinkSchema = z.object({
  subjectType: z.enum(['guest', 'vendor', 'cleaner', 'staff']),
  subjectId: z.string().uuid(),
  ttlMinutes: z.number().int().min(5).max(60 * 24 * 7).optional(),
});
export type MagicLinkDto = z.infer<typeof magicLinkSchema>;

export const verifyMagicLinkSchema = z.object({
  token: z.string().min(1),
});
export type VerifyMagicLinkDto = z.infer<typeof verifyMagicLinkSchema>;
