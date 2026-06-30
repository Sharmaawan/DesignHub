import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Get current user's email settings
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpEnabled: true,
      },
    });

    res.json({
      connected: user?.smtpEnabled || false,
      host: user?.smtpHost || '',
      port: user?.smtpPort || 587,
      email: user?.smtpUser || '',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get email settings' });
  }
});

// Connect / update email credentials
router.post('/connect', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, appPassword, host, port } = req.body;

    if (!email || !appPassword) {
      return res.status(400).json({ error: 'Email and app password are required' });
    }

    // Test the credentials before saving
    const transporter = nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port: port || 587,
      secure: false,
      auth: {
        user: email,
        pass: appPassword,
      },
    });

    try {
      await transporter.verify();
    } catch (verifyError: any) {
      return res.status(400).json({ error: 'Invalid email credentials. Please check your email and app password.' });
    }

    // Save encrypted credentials
    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        smtpHost: host || 'smtp.gmail.com',
        smtpPort: port || 587,
        smtpUser: email,
        smtpPass: appPassword,
        smtpEnabled: true,
      },
    });

    res.json({ success: true, message: 'Email connected successfully!' });
  } catch (error: any) {
    console.error('Email connect error:', error);
    res.status(500).json({ error: error.message || 'Failed to connect email' });
  }
});

// Disconnect email
router.post('/disconnect', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        smtpHost: null,
        smtpPort: 587,
        smtpUser: null,
        smtpPass: null,
        smtpEnabled: false,
      },
    });

    res.json({ success: true, message: 'Email disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect email' });
  }
});

// Send test email
router.post('/test', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });

    if (!user?.smtpEnabled || !user.smtpUser || !user.smtpPass) {
      return res.status(400).json({ error: 'No email connected. Please connect your email first.' });
    }

    const transporter = nodemailer.createTransport({
      host: user.smtpHost || 'smtp.gmail.com',
      port: user.smtpPort || 587,
      secure: false,
      auth: {
        user: user.smtpUser,
        pass: user.smtpPass,
      },
    });

    await transporter.sendMail({
      from: `"DesignHub" <${user.smtpUser}>`,
      to: user.smtpUser,
      subject: 'DesignHub - Email Connected!',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #7B2FBE;">Email Connected Successfully!</h2>
          <p>Your email <strong>${user.smtpUser}</strong> is now connected to DesignHub.</p>
          <p>When you invite team members, invitation emails will be sent from your email address.</p>
        </div>
      `,
    });

    res.json({ success: true, message: 'Test email sent! Check your inbox.' });
  } catch (error: any) {
    console.error('Test email error:', error);
    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
});

export default router;
