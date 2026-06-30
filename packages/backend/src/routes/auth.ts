import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { OAuth2Client } from 'google-auth-library';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'designhub-secret-key-2024';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ===== EMAIL REGISTER =====
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
    const user = await prisma.user.create({
      data: { name, email, passwordHash, avatar },
    });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar }, token });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== EMAIL LOGIN =====
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar }, token });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== GOOGLE OAUTH =====
// Accepts a Google ID token (from Google Identity Services on the frontend)
// Verifies it server-side, creates/finds user, returns our JWT
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential, clientId } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    let googleUser: { sub: string; email: string; name: string; picture: string };

    // If GOOGLE_CLIENT_ID is set, verify the token server-side (production)
    if (GOOGLE_CLIENT_ID) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: clientId || GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
          return res.status(401).json({ error: 'Invalid Google token' });
        }
        googleUser = {
          sub: payload.sub,
          email: payload.email || '',
          name: payload.name || '',
          picture: payload.picture || '',
        };
      } catch (verifyError) {
        return res.status(401).json({ error: 'Invalid or expired Google token' });
      }
    } else {
      // Dev mode: decode JWT without verification (only when no client ID is configured)
      try {
        const parts = credential.split('.');
        if (parts.length !== 3) {
          return res.status(401).json({ error: 'Invalid Google token format' });
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        googleUser = {
          sub: payload.sub || '',
          email: payload.email || '',
          name: payload.name || '',
          picture: payload.picture || '',
        };
      } catch {
        return res.status(401).json({ error: 'Failed to decode Google token' });
      }
    }

    if (!googleUser.email) {
      return res.status(400).json({ error: 'No email found in Google account' });
    }

    // Find existing user by googleId or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleUser.sub },
          { email: googleUser.email },
        ],
      },
    });

    if (user) {
      // Update existing user with Google info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleUser.sub,
          name: user.name || googleUser.name,
          avatar: user.avatar || googleUser.picture,
          provider: 'google',
          lastLogin: new Date(),
        },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          name: googleUser.name,
          avatar: googleUser.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${googleUser.email}`,
          googleId: googleUser.sub,
          provider: 'google',
          lastLogin: new Date(),
        },
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      token,
    });
  } catch (error: any) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: error.message || 'Google authentication failed' });
  }
});

// ===== GET CURRENT USER =====
router.get('/me', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, name: user.name, avatar: user.avatar, provider: user.provider });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ===== UPDATE PROFILE =====
router.put('/me', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const { name, avatar } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (avatar !== undefined) updateData.avatar = avatar;

    const user = await prisma.user.update({
      where: { id: decoded.id },
      data: updateData,
    });
    res.json({ id: user.id, email: user.email, name: user.name, avatar: user.avatar });
  } catch {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===== CHANGE PASSWORD =====
router.put('/me/password', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both passwords are required' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Account uses Google login. Set a password via Profile Settings.' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: decoded.id }, data: { passwordHash } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
