import { Router } from 'express';
import authRouter from './authRouter';
import tournamentRouter from './tournamentRouter';
import matchRouter from './matchRouter';
import teamRouter from './teamRouter';

const router = Router();

router.use('/auth', authRouter);
router.use('/tournaments', tournamentRouter);
router.use('/matches', matchRouter);
router.use('/teams', teamRouter);

export default router;
