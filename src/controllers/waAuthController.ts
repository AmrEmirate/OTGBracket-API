import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/prisma';

// In-memory store for login sessions
// Key: sessionId (e.g. PB-12345), Value: session data
export interface SessionData {
  status: 'PENDING' | 'VERIFIED' | 'CONSUMED';
  role?: 'ADMIN' | 'PARTICIPANT';
  phone?: string;
  waName?: string;
  magicToken?: string;
  createdAt: Date;
  user?: any;
}
export const authSessions = new Map<string, SessionData>();

export const verifySessionWithPhone = (sessionId: string, phone: string, waName?: string): boolean => {
  const session = authSessions.get(sessionId);
  if (!session || session.status !== 'PENDING') return false;
  
  session.status = 'VERIFIED';
  session.phone = phone;
  if (waName) session.waName = waName;
  authSessions.set(sessionId, session);
  return true;
};

import { getBotNumber, sendMessageToPhone } from '../services/whatsappService';

export const getWaBotNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const num = getBotNumber();
    if (num) {
      res.json({ number: num });
    } else {
      res.status(503).json({ error: 'WhatsApp bot is not ready' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateWaSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    // Clean phone number
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('8')) {
      cleanPhone = '62' + cleanPhone;
    }

    // Generate unique session ID: PB-XXXXXX
    const sessionId = `PB-${Math.floor(100000 + Math.random() * 900000)}`;
    
    // Generate magic token
    const magicToken = require('crypto').randomBytes(16).toString('hex');
    
    authSessions.set(sessionId, {
      status: 'PENDING',
      phone: cleanPhone,
      magicToken: magicToken,
      createdAt: new Date()
    });

    // Send Magic Link via WhatsApp
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
    const magicLinkUrl = `${backendUrl}/api/auth/wa/magic?token=${magicToken}`;
    const message = `Halo dari OTGBracket! 👋\n\nSeseorang mencoba masuk ke akun Anda. Jika ini Anda, klik tautan ajaib di bawah ini untuk langsung masuk:\n\n🔗 ${magicLinkUrl}\n\nAbaikan pesan ini jika Anda tidak merasa login.`;
    
    const sent = await sendMessageToPhone(cleanPhone, message);
    if (!sent) {
      authSessions.delete(sessionId);
      res.status(500).json({ error: 'Failed to send WhatsApp message. Is the bot ready?' });
      return;
    }

    // Cleanup old sessions to prevent memory leak
    const now = new Date().getTime();
    for (const [key, data] of authSessions.entries()) {
      if (now - data.createdAt.getTime() > 10 * 60 * 1000) { // 10 minutes expiry
        authSessions.delete(key);
      }
    }

    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Generate WA Session Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const pollWaSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId as string;
    
    if (!sessionId || !authSessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const session = authSessions.get(sessionId)!;

    if (session.status === 'PENDING') {
      res.json({ status: 'PENDING' });
      return;
    }

    if (session.status === 'CONSUMED' && session.user) {
      const userData = session.user;
      authSessions.delete(sessionId);
      res.json({
        status: 'SUCCESS',
        user: userData
      });
      return;
    }

    if (session.status === 'VERIFIED' && session.phone) {
      // Auto-assign roles based on phone number
      const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
      const calculatedRole = adminNumbers.includes(session.phone) ? 'ADMIN' : 'PARTICIPANT';

      // Process login
      let user = await prisma.user.findUnique({ where: { phone: session.phone } });
      
      if (!user) {
        user = await prisma.user.create({
          data: {
            phone: session.phone,
            role: calculatedRole
          }
        });
      } else if (user.role !== calculatedRole && adminNumbers.includes(session.phone)) {
        // Upgrade existing user to admin if they are in the list
        user = await prisma.user.update({
          where: { phone: session.phone },
          data: { role: 'ADMIN' }
        });
      }

      const secret = process.env.JWT_SECRET || 'fallback_secret';
      const token = jwt.sign(
        { id: user.id, phone: user.phone, role: user.role },
        secret,
        { expiresIn: '1d' }
      );

      // Consume session
      authSessions.delete(sessionId);

      res.json({
        status: 'SUCCESS',
        user: {
          id: user.id,
          phone: session.waName || user.phone, // Use WA name if available for display
          role: user.role,
          token
        }
      });
    }
  } catch (error) {
    console.error('Poll WA Session Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyMagicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).send('Token is missing');
      return;
    }

    // Find the session with this magic token
    let foundSessionId: string | null = null;
    let foundSession: SessionData | null = null;

    for (const [key, data] of authSessions.entries()) {
      if (data.magicToken === token && data.status === 'PENDING') {
        foundSessionId = key;
        foundSession = data;
        break;
      }
    }

    if (!foundSessionId || !foundSession) {
      res.status(400).send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2 style="color: #ff3333;">Tautan Kadaluarsa atau Tidak Valid</h2>
          <p>Tautan ini sudah tidak bisa digunakan. Silakan ulangi proses login dari browser Anda.</p>
        </div>
      `);
      return;
    }

    // Mark as verified
    foundSession.status = 'VERIFIED';
    
    // Generate User and JWT
    const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
    const calculatedRole = adminNumbers.includes(foundSession.phone || '') ? 'ADMIN' : 'PARTICIPANT';

    let user = await prisma.user.findUnique({ where: { phone: foundSession.phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: foundSession.phone!,
          role: calculatedRole
        }
      });
    } else if (user.role !== calculatedRole && adminNumbers.includes(foundSession.phone || '')) {
      user = await prisma.user.update({
        where: { phone: foundSession.phone },
        data: { role: 'ADMIN' }
      });
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret';
    const jwtToken = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      secret,
      { expiresIn: '1d' }
    );

    const userData = {
      id: user.id,
      phone: foundSession.waName || user.phone,
      role: user.role,
      token: jwtToken
    };

    // Instead of deleting the session, keep it so that the polling endpoint can pick up the success.
    foundSession.status = 'CONSUMED';
    foundSession.user = userData;
    authSessions.set(foundSessionId, foundSession);

    // Redirect to frontend callback
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/login/callback?user=${encodeURIComponent(JSON.stringify(userData))}`;
    
    res.redirect(callbackUrl);
  } catch (error) {
    console.error('Verify Magic Link Error:', error);
    res.status(500).send('Internal server error');
  }
};

// DEV ONLY: This simulates the webhook that would be hit by the WA Bot Provider
export const simulateWaWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, phone } = req.body;
    
    if (!sessionId || !phone) {
      res.status(400).json({ error: 'Session ID and Phone are required' });
      return;
    }

    if (!authSessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const session = authSessions.get(sessionId)!;
    session.status = 'VERIFIED';
    session.phone = phone;
    authSessions.set(sessionId, session);

    console.log(`[WA WEBHOOK SIMULATED] Session ${sessionId} verified with phone ${phone}`);
    
    res.json({ success: true, message: 'Session verified successfully' });
  } catch (error) {
    console.error('Simulate WA Webhook Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
