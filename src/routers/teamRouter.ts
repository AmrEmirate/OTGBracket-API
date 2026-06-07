import { Router } from 'express';
import { updateTeam } from '../controllers/teamController';
import { isAdmin } from '../middleware/authMiddleware';

const router = Router();

router.put('/:id', isAdmin, updateTeam);

export default router;
