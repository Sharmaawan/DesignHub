import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const categories = await Promise.all([
    prisma.category.create({ data: { name: 'Social Media', icon: '📱', sortOrder: 1 } }),
    prisma.category.create({ data: { name: 'Presentations', icon: '📊', sortOrder: 2 } }),
    prisma.category.create({ data: { name: 'Posters', icon: '🖼️', sortOrder: 3 } }),
    prisma.category.create({ data: { name: 'Resume', icon: '📄', sortOrder: 4 } }),
    prisma.category.create({ data: { name: 'Certificates', icon: '🏆', sortOrder: 5 } }),
    prisma.category.create({ data: { name: 'Business Cards', icon: '💼', sortOrder: 6 } }),
    prisma.category.create({ data: { name: 'Flyers', icon: '📋', sortOrder: 7 } }),
    prisma.category.create({ data: { name: 'Video', icon: '🎬', sortOrder: 8 } }),
    prisma.category.create({ data: { name: 'Marketing', icon: '📣', sortOrder: 9 } }),
  ]);
  console.log(`Created ${categories.length} categories`);

  const templates = await prisma.template.createMany({
    data: [
      {
        name: 'Instagram Post - Gradient',
        category: 'Social Media',
        thumbnail: '',
        tags: JSON.stringify(['instagram', 'gradient', 'social']),
        data: { pages: [{ name: 'Page 1', backgroundColor: '#FFFFFF', width: 1080, height: 1080, elements: [{ type: 'shape', x: 0, y: 0, width: 1080, height: 1080, data: { shapeType: 'rectangle', fill: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' } }, { type: 'text', x: 140, y: 400, width: 800, height: 100, data: { content: 'Your Title Here', fontFamily: 'Poppins', fontSize: 72, fontWeight: 700, color: '#FFFFFF' } }] }] },
        isPremium: false,
      },
      {
        name: 'Business Presentation',
        category: 'Presentations',
        thumbnail: '',
        tags: JSON.stringify(['business', 'presentation', 'professional']),
        data: { pages: [{ name: 'Page 1', backgroundColor: '#1B1B2F', width: 1920, height: 1080, elements: [{ type: 'shape', x: 0, y: 0, width: 1920, height: 1080, data: { shapeType: 'rectangle', fill: '#1B1B2F' } }, { type: 'text', x: 140, y: 120, width: 800, height: 80, data: { content: 'Quarterly Business Review', fontFamily: 'Plus Jakarta Sans', fontSize: 64, fontWeight: 700, color: '#FFFFFF' } }] }] },
        isPremium: false,
      },
      {
        name: 'Minimal Resume',
        category: 'Resume',
        thumbnail: '',
        tags: JSON.stringify(['resume', 'minimal', 'professional']),
        data: { pages: [{ name: 'Page 1', backgroundColor: '#FFFFFF', width: 816, height: 1056, elements: [{ type: 'shape', x: 0, y: 0, width: 816, height: 200, data: { shapeType: 'rectangle', fill: '#7B2FBE' } }, { type: 'text', x: 60, y: 50, width: 700, height: 50, data: { content: 'John Anderson', fontFamily: 'Plus Jakarta Sans', fontSize: 42, fontWeight: 700, color: '#FFFFFF' } }] }] },
        isPremium: false,
      },
      {
        name: 'Social Media Story',
        category: 'Social Media',
        thumbnail: '',
        tags: JSON.stringify(['story', 'instagram', 'colorful']),
        data: { pages: [{ name: 'Page 1', backgroundColor: '#FF6B9D', width: 1080, height: 1920, elements: [{ type: 'shape', x: 0, y: 0, width: 1080, height: 1920, data: { shapeType: 'rectangle', fill: 'linear-gradient(180deg, #FF6B9D 0%, #FF8A00 100%)' } }, { type: 'text', x: 100, y: 800, width: 880, height: 120, data: { content: 'SALE', fontFamily: 'Plus Jakarta Sans', fontSize: 180, fontWeight: 800, color: '#FFFFFF' } }] }] },
        isPremium: true,
      },
      {
        name: 'Event Flyer',
        category: 'Flyers',
        thumbnail: '',
        tags: JSON.stringify(['event', 'flyer', 'party']),
        data: { pages: [{ name: 'Page 1', backgroundColor: '#000000', width: 800, height: 1200, elements: [{ type: 'shape', x: 0, y: 0, width: 800, height: 1200, data: { shapeType: 'rectangle', fill: '#0B0B1A' } }, { type: 'text', x: 80, y: 300, width: 640, height: 200, data: { content: 'MUSIC\nFESTIVAL', fontFamily: 'Plus Jakarta Sans', fontSize: 120, fontWeight: 800, color: '#FFFFFF' } }] }] },
        isPremium: false,
      },
      {
        name: 'YouTube Thumbnail',
        category: 'Social Media',
        thumbnail: '',
        tags: JSON.stringify(['youtube', 'thumbnail', 'gaming']),
        data: { pages: [{ name: 'Page 1', backgroundColor: '#1a1a2e', width: 1280, height: 720, elements: [{ type: 'shape', x: 0, y: 0, width: 1280, height: 720, data: { shapeType: 'rectangle', fill: '#1a1a2e' } }, { type: 'text', x: 60, y: 200, width: 800, height: 120, data: { content: 'EPIC GAMING MOMENT!', fontFamily: 'Impact', fontSize: 96, fontWeight: 400, color: '#FFD700' } }] }] },
        isPremium: false,
      },
      {
        name: 'Certificate Award',
        category: 'Certificates',
        thumbnail: '',
        tags: JSON.stringify(['certificate', 'award', 'formal']),
        data: { pages: [{ name: 'Page 1', backgroundColor: '#FFF8E7', width: 1200, height: 850, elements: [{ type: 'shape', x: 20, y: 20, width: 1160, height: 810, data: { shapeType: 'rectangle', fill: 'transparent', stroke: '#C9A962', strokeWidth: 4 } }, { type: 'text', x: 100, y: 340, width: 1000, height: 80, data: { content: 'John Anderson', fontFamily: 'Playfair Display', fontSize: 56, fontWeight: 700, color: '#1a1a2e' } }] }] },
        isPremium: false,
      },
      {
        name: 'Business Card Modern',
        category: 'Business Cards',
        thumbnail: '',
        tags: JSON.stringify(['business', 'card', 'modern']),
        data: { pages: [{ name: 'Front', backgroundColor: '#1B1B2F', width: 1050, height: 600, elements: [{ type: 'shape', x: 0, y: 0, width: 1050, height: 600, data: { shapeType: 'rectangle', fill: '#1B1B2F' } }, { type: 'text', x: 60, y: 180, width: 600, height: 60, data: { content: 'John Anderson', fontFamily: 'Plus Jakarta Sans', fontSize: 42, fontWeight: 700, color: '#FFFFFF' } }] }] },
        isPremium: false,
      },
    ],
  });
  console.log(`Created ${templates.count} templates`);

  console.log('Seed completed!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
