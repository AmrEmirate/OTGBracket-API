import { Router } from 'express';
import multer from 'multer';
import { assignTeam, updateMatch, uploadEvidence, validateMatch } from '../controllers/matchController';
import { isAuthenticated, isAdmin } from '../middleware/authMiddleware';

const upload = multer({ dest: 'uploads/' });
const router = Router();

router.post('/:id/teams', isAdmin, assignTeam);
router.put('/:id', isAdmin, updateMatch);
router.post('/:id/evidence', isAuthenticated, upload.fields([{ name: 'evidenceLobby', maxCount: 1 }, { name: 'evidenceResult', maxCount: 1 }]), uploadEvidence);
router.post('/:id/validate', isAdmin, validateMatch);

export default router;
