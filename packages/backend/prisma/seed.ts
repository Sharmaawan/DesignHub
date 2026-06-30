import prisma from '../src/lib/prisma';

const SAMPLE_TEMPLATES = [
  {
    name: 'Instagram Post - Gradient',
    category: 'Social Media',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-1', name: 'Page 1',
        backgroundColor: '#667eea',
        width: 1080, height: 1080,
        elements: [
          { id: 'el-1', type: 'text', x: 100, y: 300, width: 880, height: 80, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Title',
            data: { type: 'text', content: 'Your Amazing Title', fontFamily: 'Plus Jakarta Sans', fontSize: 64, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-2', type: 'text', x: 200, y: 420, width: 680, height: 50, rotation: 0, opacity: 0.9, visible: true, locked: false, zIndex: 1, name: 'Subtitle',
            data: { type: 'text', content: 'Add your subtitle here', fontFamily: 'Inter', fontSize: 24, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-3', type: 'shape', x: 390, y: 520, width: 300, height: 50, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 2, name: 'Button',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#FFFFFF', stroke: 'transparent', strokeWidth: 0, cornerRadius: 25 } },
          { id: 'el-4', type: 'text', x: 440, y: 530, width: 200, height: 30, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 3, name: 'Button Text',
            data: { type: 'text', content: 'Learn More', fontFamily: 'Inter', fontSize: 16, fontWeight: 600, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#667eea', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['social', 'gradient', 'modern'],
    isPremium: false,
  },
  {
    name: 'Business Presentation',
    category: 'Presentations',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-2', name: 'Page 1',
        backgroundColor: '#1a1a2e',
        width: 1920, height: 1080,
        elements: [
          { id: 'el-1', type: 'shape', x: 0, y: 0, width: 1920, height: 8, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Accent Bar',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } },
          { id: 'el-2', type: 'text', x: 120, y: 150, width: 800, height: 80, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, name: 'Title',
            data: { type: 'text', content: 'Quarterly Business Review', fontFamily: 'Plus Jakarta Sans', fontSize: 56, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#FFFFFF', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-3', type: 'text', x: 120, y: 260, width: 600, height: 40, rotation: 0, opacity: 0.7, visible: true, locked: false, zIndex: 2, name: 'Subtitle',
            data: { type: 'text', content: 'Q4 2024 Performance Summary', fontFamily: 'Inter', fontSize: 22, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#999999', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-4', type: 'shape', x: 120, y: 380, width: 350, height: 200, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 3, name: 'Metric Card 1',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#2a2a4a', stroke: '#333366', strokeWidth: 1, cornerRadius: 16 } },
          { id: 'el-5', type: 'text', x: 150, y: 410, width: 290, height: 40, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 4, name: 'Metric 1 Value',
            data: { type: 'text', content: '$2.4M', fontFamily: 'Plus Jakarta Sans', fontSize: 36, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#7B2FBE', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-6', type: 'text', x: 150, y: 460, width: 290, height: 30, rotation: 0, opacity: 0.6, visible: true, locked: false, zIndex: 5, name: 'Metric 1 Label',
            data: { type: 'text', content: 'Total Revenue', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#999999', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-7', type: 'shape', x: 510, y: 380, width: 350, height: 200, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 6, name: 'Metric Card 2',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#2a2a4a', stroke: '#333366', strokeWidth: 1, cornerRadius: 16 } },
          { id: 'el-8', type: 'text', x: 540, y: 410, width: 290, height: 40, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 7, name: 'Metric 2 Value',
            data: { type: 'text', content: '18,420', fontFamily: 'Plus Jakarta Sans', fontSize: 36, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#10B981', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-9', type: 'text', x: 540, y: 460, width: 290, height: 30, rotation: 0, opacity: 0.6, visible: true, locked: false, zIndex: 8, name: 'Metric 2 Label',
            data: { type: 'text', content: 'New Customers', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#999999', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['business', 'presentation', 'dark'],
    isPremium: false,
  },
  {
    name: 'Instagram Story - Sale',
    category: 'Social Media',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-3', name: 'Page 1',
        backgroundColor: '#ec4899',
        width: 1080, height: 1920,
        elements: [
          { id: 'el-1', type: 'text', x: 100, y: 400, width: 880, height: 100, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Big Text',
            data: { type: 'text', content: 'SALE', fontFamily: 'Plus Jakarta Sans', fontSize: 120, fontWeight: 800, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.0, letterSpacing: -2, textTransform: 'uppercase' } },
          { id: 'el-2', type: 'text', x: 200, y: 560, width: 680, height: 60, rotation: 0, opacity: 0.9, visible: true, locked: false, zIndex: 1, name: 'Discount',
            data: { type: 'text', content: 'UP TO 50% OFF', fontFamily: 'Inter', fontSize: 36, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.2, letterSpacing: 4, textTransform: 'uppercase' } },
          { id: 'el-3', type: 'text', x: 200, y: 660, width: 680, height: 40, rotation: 0, opacity: 0.8, visible: true, locked: false, zIndex: 2, name: 'Dates',
            data: { type: 'text', content: 'January 15 - 31, 2025', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['sale', 'story', 'promotion'],
    isPremium: false,
  },
  {
    name: 'YouTube Thumbnail',
    category: 'Social Media',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-4', name: 'Page 1',
        backgroundColor: '#1e1e30',
        width: 1280, height: 720,
        elements: [
          { id: 'el-1', type: 'shape', x: 640, y: 360, width: 1100, height: 300, rotation: -5, opacity: 0.3, visible: true, locked: false, zIndex: 0, name: 'Background Shape',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 24 } },
          { id: 'el-2', type: 'text', x: 80, y: 200, width: 1120, height: 100, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, name: 'Title',
            data: { type: 'text', content: 'How to Build Amazing Apps', fontFamily: 'Plus Jakarta Sans', fontSize: 72, fontWeight: 800, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#FFFFFF', lineHeight: 1.1, letterSpacing: -1, textTransform: 'none' } },
          { id: 'el-3', type: 'text', x: 80, y: 330, width: 800, height: 50, rotation: 0, opacity: 0.8, visible: true, locked: false, zIndex: 2, name: 'Subtitle',
            data: { type: 'text', content: 'In Just 10 Minutes!', fontFamily: 'Inter', fontSize: 32, fontWeight: 600, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#F59E0B', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['youtube', 'thumbnail', 'tech'],
    isPremium: false,
  },
  {
    name: 'Resume - Minimal',
    category: 'Resume',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-5', name: 'Page 1',
        backgroundColor: '#FFFFFF',
        width: 816, height: 1056,
        elements: [
          { id: 'el-1', type: 'shape', x: 0, y: 0, width: 816, height: 160, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Header',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } },
          { id: 'el-2', type: 'text', x: 60, y: 50, width: 500, height: 50, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, name: 'Name',
            data: { type: 'text', content: 'John Anderson', fontFamily: 'Plus Jakarta Sans', fontSize: 36, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#FFFFFF', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-3', type: 'text', x: 60, y: 105, width: 500, height: 30, rotation: 0, opacity: 0.9, visible: true, locked: false, zIndex: 2, name: 'Title',
            data: { type: 'text', content: 'Senior Product Designer', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#FFFFFF', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-4', type: 'text', x: 60, y: 220, width: 700, height: 30, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 3, name: 'Section Title',
            data: { type: 'text', content: 'EXPERIENCE', fontFamily: 'Inter', fontSize: 14, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#7B2FBE', lineHeight: 1.4, letterSpacing: 2, textTransform: 'uppercase' } },
          { id: 'el-5', type: 'text', x: 60, y: 260, width: 700, height: 80, rotation: 0, opacity: 0.8, visible: true, locked: false, zIndex: 4, name: 'Experience',
            data: { type: 'text', content: 'Product Designer at TechCorp (2020 - Present)\nLed design team of 5, shipped 12 features\nImproved user retention by 35%', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#333333', lineHeight: 1.6, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['resume', 'minimal', 'professional'],
    isPremium: false,
  },
  {
    name: 'Event Flyer',
    category: 'Flyers',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-6', name: 'Page 1',
        backgroundColor: '#0f172a',
        width: 800, height: 1200,
        elements: [
          { id: 'el-1', type: 'shape', x: 400, y: 600, width: 600, height: 600, rotation: 45, opacity: 0.15, visible: true, locked: false, zIndex: 0, name: 'Decorative Square',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } },
          { id: 'el-2', type: 'text', x: 60, y: 200, width: 680, height: 80, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, name: 'Event Name',
            data: { type: 'text', content: 'MUSIC FESTIVAL', fontFamily: 'Plus Jakarta Sans', fontSize: 64, fontWeight: 800, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.1, letterSpacing: -1, textTransform: 'uppercase' } },
          { id: 'el-3', type: 'text', x: 100, y: 320, width: 600, height: 40, rotation: 0, opacity: 0.8, visible: true, locked: false, zIndex: 2, name: 'Date',
            data: { type: 'text', content: 'MARCH 15, 2025 • 8:00 PM', fontFamily: 'Inter', fontSize: 20, fontWeight: 600, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#F59E0B', lineHeight: 1.4, letterSpacing: 2, textTransform: 'uppercase' } },
          { id: 'el-4', type: 'text', x: 100, y: 400, width: 600, height: 40, rotation: 0, opacity: 0.7, visible: true, locked: false, zIndex: 3, name: 'Venue',
            data: { type: 'text', content: 'Central Park Arena', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#94a3b8', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['event', 'flyer', 'music'],
    isPremium: false,
  },
  {
    name: 'Certificate Award',
    category: 'Certificates',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-7', name: 'Page 1',
        backgroundColor: '#FFFEF7',
        width: 1200, height: 850,
        elements: [
          { id: 'el-1', type: 'shape', x: 30, y: 30, width: 1140, height: 790, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Border',
            data: { type: 'shape', shapeType: 'rectangle', fill: 'transparent', stroke: '#D4AF37', strokeWidth: 4, cornerRadius: 8 } },
          { id: 'el-2', type: 'text', x: 200, y: 120, width: 800, height: 50, rotation: 0, opacity: 0.7, visible: true, locked: false, zIndex: 1, name: 'Certificate Of',
            data: { type: 'text', content: 'CERTIFICATE OF', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#B8860B', lineHeight: 1.4, letterSpacing: 6, textTransform: 'uppercase' } },
          { id: 'el-3', type: 'text', x: 200, y: 170, width: 800, height: 70, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 2, name: 'Achievement',
            data: { type: 'text', content: 'ACHIEVEMENT', fontFamily: 'Playfair Display', fontSize: 52, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#1a1a1a', lineHeight: 1.2, letterSpacing: 2, textTransform: 'none' } },
          { id: 'el-4', type: 'text', x: 200, y: 350, width: 800, height: 40, rotation: 0, opacity: 0.6, visible: true, locked: false, zIndex: 3, name: 'Presented To',
            data: { type: 'text', content: 'This is proudly presented to', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, fontStyle: 'italic', textDecoration: 'none', textAlign: 'center', color: '#666666', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-5', type: 'text', x: 200, y: 410, width: 800, height: 60, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 4, name: 'Recipient',
            data: { type: 'text', content: 'John Anderson', fontFamily: 'Playfair Display', fontSize: 42, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#7B2FBE', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['certificate', 'award', 'formal'],
    isPremium: false,
  },
  {
    name: 'Business Card',
    category: 'Business Cards',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-8', name: 'Page 1',
        backgroundColor: '#1a1a2e',
        width: 1050, height: 600,
        elements: [
          { id: 'el-1', type: 'shape', x: 800, y: -50, width: 300, height: 300, rotation: 45, opacity: 0.1, visible: true, locked: false, zIndex: 0, name: 'Decorative',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } },
          { id: 'el-2', type: 'text', x: 60, y: 80, width: 500, height: 50, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, name: 'Name',
            data: { type: 'text', content: 'Sarah Chen', fontFamily: 'Plus Jakarta Sans', fontSize: 32, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#FFFFFF', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-3', type: 'text', x: 60, y: 135, width: 400, height: 30, rotation: 0, opacity: 0.7, visible: true, locked: false, zIndex: 2, name: 'Role',
            data: { type: 'text', content: 'Creative Director', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#7B2FBE', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-4', type: 'text', x: 60, y: 350, width: 500, height: 100, rotation: 0, opacity: 0.6, visible: true, locked: false, zIndex: 3, name: 'Contact',
            data: { type: 'text', content: 'sarah@company.com\n+1 (555) 123-4567\nwww.company.com', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#999999', lineHeight: 1.8, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['business', 'card', 'minimal'],
    isPremium: false,
  },
  {
    name: 'Facebook Post',
    category: 'Social Media',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-9', name: 'Page 1',
        backgroundColor: '#f8fafc',
        width: 1200, height: 630,
        elements: [
          { id: 'el-1', type: 'shape', x: 60, y: 40, width: 1080, height: 550, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Card',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#FFFFFF', stroke: '#e2e8f0', strokeWidth: 1, cornerRadius: 16 } },
          { id: 'el-2', type: 'text', x: 120, y: 120, width: 960, height: 60, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, name: 'Headline',
            data: { type: 'text', content: 'Exciting News!', fontFamily: 'Plus Jakarta Sans', fontSize: 42, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#1a1a2e', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-3', type: 'text', x: 180, y: 220, width: 840, height: 80, rotation: 0, opacity: 0.7, visible: true, locked: false, zIndex: 2, name: 'Description',
            data: { type: 'text', content: 'We are thrilled to announce our latest update. Check out what\'s new and improved!', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#64748b', lineHeight: 1.6, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-4', type: 'shape', x: 460, y: 380, width: 280, height: 50, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 3, name: 'CTA Button',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 25 } },
          { id: 'el-5', type: 'text', x: 490, y: 390, width: 220, height: 30, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 4, name: 'CTA Text',
            data: { type: 'text', content: 'Learn More', fontFamily: 'Inter', fontSize: 16, fontWeight: 600, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['facebook', 'post', 'announcement'],
    isPremium: false,
  },
  {
    name: 'Poster - Modern',
    category: 'Posters',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-10', name: 'Page 1',
        backgroundColor: '#0f172a',
        width: 800, height: 1200,
        elements: [
          { id: 'el-1', type: 'shape', x: -100, y: 700, width: 500, height: 500, rotation: 30, opacity: 0.08, visible: true, locked: false, zIndex: 0, name: 'Circle 1',
            data: { type: 'shape', shapeType: 'circle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } },
          { id: 'el-2', type: 'shape', x: 500, y: -100, width: 400, height: 400, rotation: 0, opacity: 0.06, visible: true, locked: false, zIndex: 1, name: 'Circle 2',
            data: { type: 'shape', shapeType: 'circle', fill: '#3B82F6', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } },
          { id: 'el-3', type: 'text', x: 60, y: 300, width: 680, height: 100, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 2, name: 'Title',
            data: { type: 'text', content: 'CREATIVE\nWORKSHOP', fontFamily: 'Plus Jakarta Sans', fontSize: 72, fontWeight: 800, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#FFFFFF', lineHeight: 1.0, letterSpacing: -2, textTransform: 'none' } },
          { id: 'el-4', type: 'text', x: 60, y: 500, width: 500, height: 40, rotation: 0, opacity: 0.6, visible: true, locked: false, zIndex: 3, name: 'Date',
            data: { type: 'text', content: 'APRIL 20, 2025 • 2:00 PM', fontFamily: 'Inter', fontSize: 18, fontWeight: 600, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#7B2FBE', lineHeight: 1.4, letterSpacing: 2, textTransform: 'uppercase' } },
        ],
      }],
    },
    tags: ['poster', 'modern', 'workshop'],
    isPremium: false,
  },
  {
    name: 'Twitter Post',
    category: 'Social Media',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-11', name: 'Page 1',
        backgroundColor: '#0f172a',
        width: 1200, height: 675,
        elements: [
          { id: 'el-1', type: 'text', x: 80, y: 180, width: 1040, height: 80, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Headline',
            data: { type: 'text', content: 'Big things are coming...', fontFamily: 'Plus Jakarta Sans', fontSize: 56, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-2', type: 'text', x: 200, y: 300, width: 800, height: 40, rotation: 0, opacity: 0.6, visible: true, locked: false, zIndex: 1, name: 'Subtext',
            data: { type: 'text', content: 'Stay tuned for our announcement next week', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#94a3b8', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['twitter', 'teaser', 'announcement'],
    isPremium: false,
  },
  {
    name: 'Logo Design',
    category: 'Logos',
    thumbnail: '',
    data: {
      pages: [{
        id: 'tpl-12', name: 'Page 1',
        backgroundColor: '#FFFFFF',
        width: 500, height: 500,
        elements: [
          { id: 'el-1', type: 'shape', x: 150, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Logo Shape',
            data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 40 } },
          { id: 'el-2', type: 'text', x: 175, y: 155, width: 150, height: 60, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 1, name: 'Logo Text',
            data: { type: 'text', content: 'D', fontFamily: 'Plus Jakarta Sans', fontSize: 48, fontWeight: 800, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#FFFFFF', lineHeight: 1.0, letterSpacing: 0, textTransform: 'none' } },
          { id: 'el-3', type: 'text', x: 75, y: 330, width: 350, height: 50, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 2, name: 'Brand Name',
            data: { type: 'text', content: 'DesignHub', fontFamily: 'Plus Jakarta Sans', fontSize: 32, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#1a1a1a', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' } },
        ],
      }],
    },
    tags: ['logo', 'brand', 'minimal'],
    isPremium: false,
  },
];

async function main() {
  console.log('Seeding templates...');

  // Check if templates already exist
  const count = await prisma.template.count();
  if (count > 0) {
    console.log(`${count} templates already exist. Skipping seed.`);
    return;
  }

  for (const template of SAMPLE_TEMPLATES) {
    await prisma.template.create({
      data: {
        name: template.name,
        category: template.category,
        thumbnail: template.thumbnail,
        data: template.data,
        tags: template.tags,
        isPremium: template.isPremium,
      },
    });
    console.log(`  Created template: ${template.name}`);
  }

  console.log(`Seeded ${SAMPLE_TEMPLATES.length} templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
