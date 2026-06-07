import { Request, Response } from 'express';
import { Match, Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { isPowerOfTwo } from '../utils/math';

export const generateTournament = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, format, participantCount } = req.body;
    const count = parseInt(participantCount);
    
    if (isNaN(count) || count < 2) {
      res.status(400).json({ error: 'Participant count must be at least 2.' });
      return;
    }
    
    if (count > 512) {
      res.status(400).json({ error: 'Maksimal jumlah peserta adalah 512.' });
      return;
    }

    const bracketSize = Math.pow(2, Math.ceil(Math.log2(count)));

    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'Unauthorized: User not found in request' });
      return;
    }

    // Buat Turnamen
    const tournament = await prisma.tournament.create({
      data: {
        name: name || 'OTG Bracket Tournament',
        description: description || null,
        format: format === 'DOUBLE_ELIMINATION' ? 'DOUBLE_ELIMINATION' : 'SINGLE_ELIMINATION',
        participantCount: count,
        status: 'PENDING',
        adminId: req.user.id
      }
    });

    const totalRounds = Math.log2(bracketSize);
    
    // UPPER BRACKET
    const upperMap: Record<number, Match[]> = {};
    let upperMatchCount = bracketSize / 2;
    for (let r = 1; r <= totalRounds; r++) {
      upperMap[r] = [];
      for (let m = 0; m < upperMatchCount; m++) {
        const match = await prisma.match.create({
          data: {
            tournamentId: tournament.id,
            round: r,
            isLowerBracket: false,
            status: 'PENDING'
          }
        });
        upperMap[r].push(match);
      }
      upperMatchCount = upperMatchCount / 2;
    }

    // Sambungkan Upper Bracket nextMatchId
    for (let r = 1; r < totalRounds; r++) {
      const currentRoundMatches = upperMap[r];
      const nextRoundMatches = upperMap[r + 1];
      for (let i = 0; i < currentRoundMatches.length; i++) {
        const nextMatchIndex = Math.floor(i / 2);
        await prisma.match.update({
          where: { id: currentRoundMatches[i].id },
          data: { nextMatchId: nextRoundMatches[nextMatchIndex].id }
        });
      }
    }

    // LOWER BRACKET (Jika DOUBLE_ELIMINATION)
    if (format === 'DOUBLE_ELIMINATION') {
      // Logic Double Elimination sangat rumit. Ini implementasi dasar.
      const lowerMap: Record<number, Match[]> = {};
      const lowerRounds = (totalRounds - 1) * 2;
      let lowerMatchCount = bracketSize / 4;
      
      for (let r = 1; r <= lowerRounds; r++) {
        lowerMap[r] = [];
        for (let m = 0; m < lowerMatchCount; m++) {
          const match = await prisma.match.create({
            data: {
              tournamentId: tournament.id,
              round: r,
              isLowerBracket: true,
              status: 'PENDING'
            }
          });
          lowerMap[r].push(match);
        }
        if (r % 2 === 0) lowerMatchCount = lowerMatchCount / 2; // match count drops every even round
      }

      // Sambungkan Lower Bracket nextMatchId
      for (let r = 1; r < lowerRounds; r++) {
        const curr = lowerMap[r];
        const next = lowerMap[r + 1];
        for (let i = 0; i < curr.length; i++) {
          const nextIndex = r % 2 === 1 ? i : Math.floor(i / 2);
          await prisma.match.update({
            where: { id: curr[i].id },
            data: { nextMatchId: next[nextIndex].id }
          });
        }
      }

      // Hubungkan Losers dari Upper ke Lower
      // R1 Upper Loser -> R1 Lower
      for (let i = 0; i < upperMap[1].length; i++) {
        await prisma.match.update({
          where: { id: upperMap[1][i].id },
          data: { nextLoserMatchId: lowerMap[1][Math.floor(i / 2)].id }
        });
      }

      // Grand Final: Winner Upper vs Winner Lower
      const grandFinal = await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          round: totalRounds + 1,
          isLowerBracket: false, // Menyatukan
          status: 'PENDING'
        }
      });

      // Update ujung dari Upper dan Lower ke Grand Final
      await prisma.match.update({
        where: { id: upperMap[totalRounds][0].id },
        data: { nextMatchId: grandFinal.id }
      });
      await prisma.match.update({
        where: { id: lowerMap[lowerRounds][0].id },
        data: { nextMatchId: grandFinal.id }
      });
    }

    res.json({ success: true, tournamentId: tournament.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate bracket' });
  }
};

export const getTournament = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tournament = await prisma.tournament.findUnique({
      where: { id: Number(id) },
      include: {
        matches: {
          include: {
            teamA: true,
            teamB: true
          },
          orderBy: [
            { isLowerBracket: 'asc' },
            { round: 'asc' },
            { id: 'asc' }
          ]
        }
      }
    });

    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }
    res.json(tournament);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAllTournaments = async (req: Request, res: Response): Promise<void> => {
  try {
    const tournaments = await prisma.tournament.findMany({
      include: { admin: { select: { phone: true, role: true } } },
      orderBy: { id: 'desc' }
    });
    res.json({ success: true, tournaments });
  } catch (error) {
    console.error('Fetch tournaments error:', error);
    res.status(500).json({ error: 'Failed to fetch tournaments' });
  }
};

export const deleteTournament = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const tournament = await prisma.tournament.findUnique({ where: { id: Number(id) } });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }
    
    // Remove self-relations to prevent foreign key constraint errors during deletion
    await prisma.match.updateMany({
      where: { tournamentId: Number(id) },
      data: { nextMatchId: null, nextLoserMatchId: null }
    });
    
    // Delete all matches
    await prisma.match.deleteMany({
      where: { tournamentId: Number(id) }
    });
    
    // Delete tournament
    await prisma.tournament.delete({
      where: { id: Number(id) }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tournament error:', error);
    res.status(500).json({ error: 'Failed to delete tournament' });
  }
};

export const shuffleTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Ambil semua match ronde 1 Upper Bracket
    const r1Matches = await prisma.match.findMany({
      where: { tournamentId: Number(id), round: 1, isLowerBracket: false }
    });

    // Kumpulkan semua Team ID yang sudah masuk
    const teamIds: number[] = [];
    r1Matches.forEach(m => {
      if (m.teamAId) teamIds.push(m.teamAId);
      if (m.teamBId) teamIds.push(m.teamBId);
    });

    // Shuffle array
    for (let i = teamIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
    }

    // Masukkan kembali ke match
    let teamIndex = 0;
    for (const m of r1Matches) {
      await prisma.match.update({
        where: { id: m.id },
        data: {
          teamAId: teamIndex < teamIds.length ? teamIds[teamIndex++] : null,
          teamBId: teamIndex < teamIds.length ? teamIds[teamIndex++] : null,
        }
      });
    }

    res.json({ success: true, shuffled: teamIds.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to shuffle teams' });
  }
};

export const scheduleMatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { round, isLower, time } = req.body;

    const scheduledTime = new Date(time);

    await prisma.match.updateMany({
      where: { 
        tournamentId: Number(id), 
        round: Number(round),
        isLowerBracket: Boolean(isLower)
      },
      data: { scheduledTime }
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to schedule matches' });
  }
};
