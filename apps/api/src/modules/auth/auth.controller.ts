/**
 * apps/api/src/modules/auth/auth.controller.ts
 */

import type { Request, Response } from "express";
import * as authService from "./auth.service";

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const { user, tokens } = await authService.register(req.body);
  res.status(201).json({ success: true, data: { user, ...tokens } });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { user, tokens } = await authService.login(req.body);
  res.status(200).json({ success: true, data: { user, ...tokens } });
}

export async function googleAuthHandler(req: Request, res: Response): Promise<void> {
  const { user, tokens } = await authService.loginWithGoogle(req.body.idToken);
  res.status(200).json({ success: true, data: { user, ...tokens } });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.status(200).json({ success: true, data: tokens });
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  await authService.logout(req.body.refreshToken);
  res.status(200).json({ success: true, data: { loggedOut: true } });
}

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  const user = await authService.getCurrentUser(req.userId!);
  res.status(200).json({ success: true, data: user });
}
