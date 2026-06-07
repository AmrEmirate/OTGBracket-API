import { Router } from 'express';
import { requestOtp, verifyOtp } from '../controllers/authController';
import { generateWaSession, pollWaSession, simulateWaWebhook, getWaBotNumber, verifyMagicLink } from '../controllers/waAuthController';

const router = Router();

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);

// WA Social Login Routes
router.get('/wa/bot-number', getWaBotNumber);
router.post('/wa/generate', generateWaSession);
router.get('/wa/poll/:sessionId', pollWaSession);
router.post('/wa/webhook-simulate', simulateWaWebhook);
router.get('/wa/magic', verifyMagicLink);

export default router;
