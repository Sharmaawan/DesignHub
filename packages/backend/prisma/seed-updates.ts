import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const updates = [
    {
      title: 'AI-Powered Design Generation',
      description: 'Generate complete designs from text prompts using Claude and GPT. Create presentations, social media posts, and more with AI assistance.',
      icon: '✨',
      badge: 'NEW',
      category: 'ai_feature',
    },
    {
      title: 'Real-time Collaboration',
      description: 'Work with your team in real-time. See live cursors, edit simultaneously, and communicate instantly.',
      icon: '👥',
      badge: 'HOT',
      category: 'team_feature',
    },
    {
      title: 'Brand Hub',
      description: 'Centralize your brand assets — logos, colors, fonts, and images — for consistent designs across your team.',
      icon: '🎨',
      badge: null,
      category: 'product_update',
    },
    {
      title: 'Background Remover',
      description: 'Remove backgrounds from images automatically with our AI-powered tool. Download transparent PNGs instantly.',
      icon: '🖼️',
      badge: 'UPDATED',
      category: 'ai_feature',
    },
    {
      title: 'Smart Templates',
      description: 'Browse hundreds of professionally designed templates. Customize them in seconds with drag-and-drop editing.',
      icon: '📋',
      badge: null,
      category: 'new_template',
    },
    {
      title: 'Export in Multiple Formats',
      description: 'Download your designs as PNG, JPG, PDF, SVG, or PPTX. Choose resolution and quality settings.',
      icon: '📥',
      badge: null,
      category: 'product_update',
    },
  ];

  const existingCount = await prisma.productUpdate.count();
  if (existingCount === 0) {
    for (const update of updates) {
      await prisma.productUpdate.create({ data: update });
    }
    console.log(`Seeded ${updates.length} product updates`);
  } else {
    console.log('Product updates already exist, skipping seed');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
