import { Router } from 'express';
import { generateTournament, getTournament, shuffleTeams, scheduleMatches, getAllTournaments, deleteTournament } from '../controllers/tournamentController';
import { isAdmin } from '../middleware/authMiddleware';

const router = Router();

router.post('/', isAdmin, generateTournament);
router.get('/', getAllTournaments);
router.get('/:id', getTournament);
router.delete('/:id', isAdmin, deleteTournament);
router.post('/:id/shuffle', isAdmin, shuffleTeams);
router.put('/:id/schedule', isAdmin, scheduleMatches);

export default router;
