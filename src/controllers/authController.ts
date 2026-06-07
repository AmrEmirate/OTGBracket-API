import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/prisma';

const requestOtpSchema = z.object({
  phone: z.string().min(8),
  requestedRole: z.enum(['admin', 'participant']).optional()
});

const verifyOtpSchema = z.object({
  phone: z.string().min(8),
  otp: z.string().length(6)
});

export const requestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      return;
    }

    const { phone, requestedRole } = parsed.data;

    let user = await prisma.user.findUnique({ where: { phone } });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          otp,
          otpExpiresAt,
          role: requestedRole ? requestedRole.toUpperCase() : 'PARTICIPANT'
        }
      });
    } else {
      user = await prisma.user.update({
        where: { phone },
        data: { otp, otpExpiresAt }
      });
    }

    // SIMULASI PENGIRIMAN WHATSAPP
    console.log(`\n========================================`);
    console.log(`[SIMULASI WA] Mengirim pesan ke ${phone}`);
    console.log(`Kode OTP Anda adalah: ${otp}`);
    console.log(`========================================\n`);

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      return;
    }

    const { phone, otp } = parsed.data;

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || user.otp !== otp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid or expired OTP' });
      return;
    }

    // Clear OTP
    await prisma.user.update({
      where: { phone },
      data: { otp: null, otpExpiresAt: null }
    });

    const secret = process.env.JWT_SECRET || 'fallback_secret';
    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      secret,
      { expiresIn: '1d' }
    );

    res.json({
      id: user.id,
      name: user.phone,
      role: user.role,
      token
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
