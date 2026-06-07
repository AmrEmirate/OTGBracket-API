import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

export const assignTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, phone, slot } = req.body; // slot = 'A' atau 'B'

    const match = await prisma.match.findUnique({ where: { id: Number(id) } });
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'Unauthorized: User not found in request' });
      return;
    }

    // Buat tim baru
    const newTeam = await prisma.team.create({
      data: {
        name,
        phone,
        ownerId: req.user.id
      }
    });

    // Pasangkan ke Match
    const updateData: Prisma.MatchUpdateInput = {};
    if (slot === 'A') updateData.teamA = { connect: { id: newTeam.id } };
    else if (slot === 'B') updateData.teamB = { connect: { id: newTeam.id } };

    const updatedMatch = await prisma.match.update({
      where: { id: Number(id) },
      data: updateData,
      include: { teamA: true, teamB: true }
    });

    res.json(updatedMatch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to assign team' });
  }
};

export const updateMatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { scoreA, scoreB, status } = req.body;

    const matchId = Number(id);
    const existingMatch = await prisma.match.findUnique({
      where: { id: matchId },
      include: { nextMatch: true, nextLoserMatch: true }
    });

    if (!existingMatch) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const updateData: Prisma.MatchUpdateInput = {};
    if (scoreA !== undefined) updateData.scoreA = Number(scoreA);
    if (scoreB !== undefined) updateData.scoreB = Number(scoreB);
    if (status) updateData.status = status;

    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: updateData
    });

    // Jika difinalisasi, masukkan pemenang (dan pecundang jika DE)
    if (status === 'FINISHED') {
      const winnerId = updatedMatch.scoreA > updatedMatch.scoreB ? existingMatch.teamAId : existingMatch.teamBId;
      const loserId = updatedMatch.scoreA > updatedMatch.scoreB ? existingMatch.teamBId : existingMatch.teamAId;
      
      // Majukan Pemenang ke nextMatch
      if (winnerId && existingMatch.nextMatchId) {
        const nextMatch = await prisma.match.findUnique({ where: { id: existingMatch.nextMatchId } });
        if (nextMatch) {
          if (!nextMatch.teamAId) {
            await prisma.match.update({ where: { id: nextMatch.id }, data: { teamAId: winnerId } });
          } else if (!nextMatch.teamBId && nextMatch.teamAId !== winnerId) {
            await prisma.match.update({ where: { id: nextMatch.id }, data: { teamBId: winnerId } });
          }
        }
      }

      // Majukan Pecundang ke nextLoserMatch (Double Elim)
      if (loserId && existingMatch.nextLoserMatchId) {
        const loserMatch = await prisma.match.findUnique({ where: { id: existingMatch.nextLoserMatchId } });
        if (loserMatch) {
          if (!loserMatch.teamAId) {
            await prisma.match.update({ where: { id: loserMatch.id }, data: { teamAId: loserId } });
          } else if (!loserMatch.teamBId && loserMatch.teamAId !== loserId) {
            await prisma.match.update({ where: { id: loserMatch.id }, data: { teamBId: loserId } });
          }
        }
      }

      // Jika tidak ada match selanjutnya, berarti ini adalah Grand Final
      if (!existingMatch.nextMatchId && !existingMatch.nextLoserMatchId) {
        await prisma.tournament.update({
          where: { id: existingMatch.tournamentId },
          data: { status: 'FINISHED' }
        });
      }
    }

    res.json(updatedMatch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update match' });
  }
};

export const uploadEvidence = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!req.user || !req.user.phone) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const match = await prisma.match.findUnique({
      where: { id: Number(id) },
      include: { teamA: true, teamB: true }
    });

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    // Validasi apakah user adalah kapten dari salah satu tim
    const userPhone = req.user.phone;
    if (match.teamA?.phone !== userPhone && match.teamB?.phone !== userPhone) {
      res.status(403).json({ error: 'Maaf, ini bukan tim Anda.' });
      return;
    }

    const evidenceLobby = files?.['evidenceLobby']?.[0]?.path;
    const evidenceResult = files?.['evidenceResult']?.[0]?.path;

    if (!evidenceLobby || !evidenceResult) {
      res.status(400).json({ error: 'Harap unggah kedua bukti (Lobby dan Hasil)' });
      return;
    }

    const updatedMatch = await prisma.match.update({
      where: { id: Number(id) },
      data: {
        evidenceLobby,
        evidenceResult,
        evidenceStatus: 'UPLOADED'
      }
    });

    res.json({ success: true, match: updatedMatch });
  } catch (error) {
    console.error('Upload evidence error:', error);
    res.status(500).json({ error: 'Failed to upload evidence' });
  }
};

export const validateMatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { action, winnerId } = req.body; // action: 'APPROVE', 'REJECT', 'DISQUALIFY'
    
    // Asumsi middleware auth sudah memvalidasi bahwa req.user adalah ADMIN.

    const existingMatch = await prisma.match.findUnique({
      where: { id: Number(id) }
    });

    if (!existingMatch) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    if (action === 'REJECT') {
      const updatedMatch = await prisma.match.update({
        where: { id: Number(id) },
        data: { evidenceStatus: 'REJECTED' }
      });
      res.json({ success: true, match: updatedMatch });
      return;
    }

    let actualWinnerId = winnerId;

    if (action === 'DISQUALIFY') {
      // Untuk DQ, admin memberikan winnerId secara eksplisit
      if (!actualWinnerId) {
        res.status(400).json({ error: 'winnerId is required for disqualification' });
        return;
      }
      await prisma.match.update({
        where: { id: Number(id) },
        data: {
          isWalkover: true,
          evidenceStatus: 'APPROVED',
          winnerId: actualWinnerId,
          status: 'FINISHED'
        }
      });
    } else if (action === 'APPROVE') {
      // Kemenangan standar
      if (!actualWinnerId) {
        res.status(400).json({ error: 'winnerId is required to approve the match' });
        return;
      }
      await prisma.match.update({
        where: { id: Number(id) },
        data: {
          evidenceStatus: 'APPROVED',
          winnerId: actualWinnerId,
          status: 'FINISHED'
        }
      });
    }

    // Majukan Pemenang ke nextMatch
    if (existingMatch.nextMatchId && actualWinnerId) {
      const nextMatch = await prisma.match.findUnique({ where: { id: existingMatch.nextMatchId } });
      if (nextMatch) {
        if (!nextMatch.teamAId) {
          await prisma.match.update({ where: { id: nextMatch.id }, data: { teamAId: actualWinnerId } });
        } else if (!nextMatch.teamBId && nextMatch.teamAId !== actualWinnerId) {
          await prisma.match.update({ where: { id: nextMatch.id }, data: { teamBId: actualWinnerId } });
        }
      }
    } else if (!existingMatch.nextMatchId && !existingMatch.nextLoserMatchId && actualWinnerId) {
      // Jika tidak ada match selanjutnya, berarti ini adalah Grand Final
      await prisma.tournament.update({
        where: { id: existingMatch.tournamentId },
        data: { status: 'FINISHED' }
      });
    }

    res.json({ success: true, message: 'Match validated' });
  } catch (error) {
    console.error('Validate match error:', error);
    res.status(500).json({ error: 'Failed to validate match' });
  }
};

