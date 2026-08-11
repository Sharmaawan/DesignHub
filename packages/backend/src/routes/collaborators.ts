import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendProjectShareEmail } from '../lib/email';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PERMISSIONS = ['viewer', 'commenter', 'editor'];

router.get('/project/:projectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const collaborators = await prisma.collaborator.findMany({
      where: { projectId: req.params.projectId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(collaborators);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch collaborators' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, email, permission } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    const perm = permission || 'viewer';
    if (!VALID_PERMISSIONS.includes(perm)) {
      return res.status(400).json({ error: 'Permission must be viewer, commenter, or editor' });
    }
    const trimmedEmail = email.trim();

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    // Only the owner manages who has access — matches how project deletion is
    // already gated, and avoids collaborators being able to add/remove each other.
    if (project.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the project owner can share this design' });
    }
    if (trimmedEmail.toLowerCase() === (req.userEmail || '').toLowerCase()) {
      return res.status(400).json({ error: "You already own this design" });
    }

    const invitedUser = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (!invitedUser) {
      return res.status(404).json({
        error: 'No DesignHub account found for that email. Ask them to sign up first, or use Link sharing instead.',
      });
    }

    let collaborator;
    try {
      collaborator = await prisma.collaborator.create({
        data: { projectId, userId: invitedUser.id, permission: perm, invitedBy: req.userId },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'This person already has access to this design' });
      }
      throw err;
    }

    const inviter = await prisma.user.findUnique({ where: { id: req.userId! } });

    await prisma.notification.create({
      data: {
        userId: invitedUser.id,
        type: 'collaboration',
        message: `${inviter?.name || 'Someone'} shared "${project.name}" with you (${perm} access)`,
      },
    });

    const designLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/editor/${projectId}`;
    const emailSent = await sendProjectShareEmail({
      to: trimmedEmail,
      inviterName: inviter?.name || inviter?.email || 'Someone',
      inviterEmail: inviter?.email || '',
      projectName: project.name,
      permission: perm,
      designLink,
      userSmtp: inviter?.smtpEnabled && inviter.smtpUser && inviter.smtpPass
        ? { host: inviter.smtpHost || 'smtp.gmail.com', port: inviter.smtpPort || 587, user: inviter.smtpUser, pass: inviter.smtpPass }
        : null,
    });

    res.json({ ...collaborator, emailSent });
  } catch (error: any) {
    console.error('Add collaborator error:', error);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { permission } = req.body;
    if (!VALID_PERMISSIONS.includes(permission)) {
      return res.status(400).json({ error: 'Permission must be viewer, commenter, or editor' });
    }
    const existing = await prisma.collaborator.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { ownerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Collaborator not found' });
    if (existing.project.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the project owner can change sharing permissions' });
    }
    const collaborator = await prisma.collaborator.update({
      where: { id: req.params.id },
      data: { permission },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(collaborator);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update collaborator' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.collaborator.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { ownerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Collaborator not found' });
    if (existing.project.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the project owner can remove collaborators' });
    }
    await prisma.collaborator.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

export default router;
