import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const updateTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;

    const team = await prisma.team.findUnique({ where: { id: Number(id) } });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const updatedTeam = await prisma.team.update({
      where: { id: Number(id) },
      data: {
        name: name !== undefined ? name : team.name,
        phone: phone !== undefined ? phone : team.phone
      }
    });

    res.json({ success: true, team: updatedTeam });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
};
