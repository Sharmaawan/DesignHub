// Curated, original DesignHub templates — replaces the thinner placeholder
// entries previously inline in SAMPLE_TEMPLATES for these categories. Every
// template mixes text + shape(s) + at least one Frame (an empty, native photo
// slot — see templateBuilders.frameSlot) + a styled background, so every
// element on the canvas is independently editable and nothing is a baked-in
// external image (no licensing dependency, matches how the birthday
// templates already work).
import { newTemplate, text, shape, frameSlot, line, page, template } from './templateBuilders';

export const CURATED_TEMPLATES = [
  // ---------- Social Media (1080x1080) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Product Launch — Bold',
      category: 'Social Media',
      tags: ['social', 'instagram', 'product', 'bold'],
      pageData: page({
        id: 'tpl-sm-1', width: 1080, height: 1080, backgroundColor: '#7B2FBE',
        elements: [
          shape({ x: 0, y: 0, width: 1080, height: 420, fill: '#6B21A8', zIndex: 0, name: 'Top Panel' }),
          frameSlot({ x: 390, y: 120, width: 300, height: 300, shapeType: 'circle', zIndex: 1, name: 'Product Photo' }),
          text({ x: 90, y: 460, width: 900, height: 90, content: 'Introducing Something New', fontFamily: 'Plus Jakarta Sans', fontSize: 52, fontWeight: 800, color: '#FFFFFF', textAlign: 'center', zIndex: 2, name: 'Title' }),
          text({ x: 140, y: 560, width: 800, height: 50, content: 'A short line about what makes it great', fontFamily: 'Inter', fontSize: 24, fontWeight: 400, color: '#E9D5FF', textAlign: 'center', zIndex: 3, name: 'Subtitle' }),
          shape({ x: 390, y: 650, width: 300, height: 64, shapeType: 'rectangle', fill: '#FFFFFF', cornerRadius: 32, zIndex: 4, name: 'CTA Button' }),
          text({ x: 390, y: 668, width: 300, height: 30, content: 'Shop Now', fontFamily: 'Inter', fontSize: 18, fontWeight: 700, color: '#6B21A8', textAlign: 'center', zIndex: 5, name: 'CTA Text' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Quote Card — Soft',
      category: 'Social Media',
      tags: ['social', 'instagram', 'quote', 'minimal'],
      pageData: page({
        id: 'tpl-sm-2', width: 1080, height: 1080, backgroundColor: '#FFF7ED',
        elements: [
          line({ x: 140, y: 280, width: 100, height: 6, fill: '#F97316', zIndex: 0, name: 'Accent Line' }),
          text({ x: 120, y: 340, width: 840, height: 280, content: '"Great design is invisible — it just works."', fontFamily: 'Playfair Display', fontSize: 46, fontWeight: 700, color: '#1C1917', textAlign: 'left', lineHeight: 1.3, zIndex: 1, name: 'Quote' }),
          frameSlot({ x: 120, y: 700, width: 90, height: 90, shapeType: 'circle', zIndex: 2, name: 'Avatar' }),
          text({ x: 230, y: 715, width: 400, height: 30, content: 'Jordan Lee', fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: '#1C1917', zIndex: 3, name: 'Author' }),
          text({ x: 230, y: 745, width: 400, height: 26, content: 'Design Lead', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#78716C', zIndex: 4, name: 'Author Title' }),
        ],
      }),
    });
  })(),

  // ---------- Presentations (1920x1080) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Pitch Deck — Cover',
      category: 'Presentations',
      tags: ['presentation', 'pitch', 'dark', 'cover'],
      pageData: page({
        id: 'tpl-pr-1', width: 1920, height: 1080, backgroundColor: '#0F172A',
        elements: [
          shape({ x: 0, y: 0, width: 12, height: 1080, fill: '#7B2FBE', zIndex: 0, name: 'Side Accent' }),
          text({ x: 140, y: 380, width: 1100, height: 120, content: 'The Future of Work', fontFamily: 'Plus Jakarta Sans', fontSize: 72, fontWeight: 800, color: '#FFFFFF', zIndex: 1, name: 'Title' }),
          text({ x: 140, y: 510, width: 900, height: 50, content: 'A pitch deck for investors — Q1 2026', fontFamily: 'Inter', fontSize: 26, fontWeight: 400, color: '#94A3B8', zIndex: 2, name: 'Subtitle' }),
          line({ x: 140, y: 600, width: 120, height: 5, fill: '#7B2FBE', zIndex: 3, name: 'Divider' }),
          frameSlot({ x: 1480, y: 380, width: 300, height: 300, shapeType: 'circle', zIndex: 4, name: 'Logo / Photo' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Team Intro Slide',
      category: 'Presentations',
      tags: ['presentation', 'team', 'light'],
      pageData: page({
        id: 'tpl-pr-2', width: 1920, height: 1080, backgroundColor: '#FFFFFF',
        elements: [
          text({ x: 140, y: 90, width: 800, height: 70, content: 'Meet the Team', fontFamily: 'Plus Jakarta Sans', fontSize: 48, fontWeight: 800, color: '#111827', zIndex: 0, name: 'Title' }),
          line({ x: 140, y: 175, width: 100, height: 5, fill: '#7B2FBE', zIndex: 1, name: 'Divider' }),
          ...[0, 1, 2].flatMap((i) => {
            const x = 220 + i * 520;
            return [
              frameSlot({ x, y: 320, width: 260, height: 260, shapeType: 'circle', zIndex: 2 + i * 3, name: `Member ${i + 1} Photo` }),
              text({ x: x - 30, y: 610, width: 320, height: 40, content: ['Amara Diallo', 'Kenji Watanabe', 'Priya Nair'][i], fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#111827', textAlign: 'center', zIndex: 3 + i * 3, name: `Member ${i + 1} Name` }),
              text({ x: x - 30, y: 650, width: 320, height: 30, content: ['Co-Founder', 'Head of Product', 'Lead Engineer'][i], fontFamily: 'Inter', fontSize: 17, fontWeight: 400, color: '#6B7280', textAlign: 'center', zIndex: 4 + i * 3, name: `Member ${i + 1} Role` }),
            ];
          }),
        ],
      }),
    });
  })(),

  // ---------- Resume (1080x1400) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Resume — Photo Sidebar',
      category: 'Resume',
      tags: ['resume', 'cv', 'photo', 'sidebar'],
      pageData: page({
        id: 'tpl-res-1', width: 1080, height: 1400, backgroundColor: '#FFFFFF',
        elements: [
          shape({ x: 0, y: 0, width: 360, height: 1400, fill: '#1F2937', zIndex: 0, name: 'Sidebar' }),
          frameSlot({ x: 100, y: 70, width: 160, height: 160, shapeType: 'circle', zIndex: 1, name: 'Photo' }),
          text({ x: 40, y: 260, width: 280, height: 40, content: 'Alex Morgan', fontFamily: 'Plus Jakarta Sans', fontSize: 26, fontWeight: 700, color: '#FFFFFF', textAlign: 'center', zIndex: 2, name: 'Name' }),
          text({ x: 40, y: 300, width: 280, height: 30, content: 'Marketing Manager', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#9CA3AF', textAlign: 'center', zIndex: 3, name: 'Title' }),
          text({ x: 40, y: 380, width: 280, height: 24, content: 'CONTACT', fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: '#7B9CF7', letterSpacing: 1, zIndex: 4, name: 'Contact Header' }),
          text({ x: 40, y: 415, width: 280, height: 100, content: 'alex.morgan@email.com\n+1 555 123 4567\nSan Francisco, CA', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#D1D5DB', lineHeight: 1.8, zIndex: 5, name: 'Contact Info' }),
          text({ x: 40, y: 560, width: 280, height: 24, content: 'SKILLS', fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: '#7B9CF7', letterSpacing: 1, zIndex: 6, name: 'Skills Header' }),
          text({ x: 40, y: 595, width: 280, height: 120, content: 'Brand Strategy\nCampaign Management\nSEO & Analytics\nTeam Leadership', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#D1D5DB', lineHeight: 1.8, zIndex: 7, name: 'Skills List' }),
          text({ x: 420, y: 70, width: 600, height: 36, content: 'EXPERIENCE', fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: '#1F2937', letterSpacing: 1, zIndex: 8, name: 'Experience Header' }),
          line({ x: 420, y: 112, width: 600, height: 3, fill: '#E5E7EB', zIndex: 9, name: 'Divider 1' }),
          text({ x: 420, y: 130, width: 600, height: 30, content: 'Senior Marketing Manager — Northwind Co.', fontFamily: 'Inter', fontSize: 18, fontWeight: 700, color: '#1F2937', zIndex: 10, name: 'Job 1 Title' }),
          text({ x: 420, y: 162, width: 600, height: 26, content: '2022 — Present', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, color: '#9CA3AF', zIndex: 11, name: 'Job 1 Dates' }),
          text({ x: 420, y: 195, width: 600, height: 80, content: 'Led rebrand and go-to-market strategy, growing qualified pipeline by 40% year over year.', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#4B5563', lineHeight: 1.5, zIndex: 12, name: 'Job 1 Desc' }),
          text({ x: 420, y: 340, width: 600, height: 36, content: 'EDUCATION', fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: '#1F2937', letterSpacing: 1, zIndex: 13, name: 'Education Header' }),
          line({ x: 420, y: 382, width: 600, height: 3, fill: '#E5E7EB', zIndex: 14, name: 'Divider 2' }),
          text({ x: 420, y: 400, width: 600, height: 30, content: 'B.A. Marketing — University of Washington', fontFamily: 'Inter', fontSize: 18, fontWeight: 700, color: '#1F2937', zIndex: 15, name: 'Edu 1' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Resume — Minimal Header',
      category: 'Resume',
      tags: ['resume', 'cv', 'minimal', 'photo'],
      pageData: page({
        id: 'tpl-res-2', width: 1080, height: 1400, backgroundColor: '#FFFFFF',
        elements: [
          frameSlot({ x: 80, y: 70, width: 130, height: 130, shapeType: 'circle', zIndex: 0, name: 'Photo' }),
          text({ x: 240, y: 85, width: 700, height: 46, content: 'Taylor Chen', fontFamily: 'Plus Jakarta Sans', fontSize: 38, fontWeight: 800, color: '#111827', zIndex: 1, name: 'Name' }),
          text({ x: 240, y: 138, width: 700, height: 32, content: 'Product Designer', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#6B7280', zIndex: 2, name: 'Title' }),
          text({ x: 240, y: 178, width: 700, height: 26, content: 'taylor.chen@email.com   ·   +1 555 987 6543   ·   Austin, TX', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, color: '#9CA3AF', zIndex: 3, name: 'Contact' }),
          line({ x: 80, y: 250, width: 920, height: 3, fill: '#111827', zIndex: 4, name: 'Divider' }),
          text({ x: 80, y: 285, width: 400, height: 28, content: 'EXPERIENCE', fontFamily: 'Inter', fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: 1, zIndex: 5, name: 'Exp Header' }),
          text({ x: 80, y: 325, width: 500, height: 28, content: 'Senior Product Designer — Vantage', fontFamily: 'Inter', fontSize: 17, fontWeight: 700, color: '#1F2937', zIndex: 6, name: 'Job Title' }),
          text({ x: 80, y: 358, width: 500, height: 24, content: '2021 — Present', fontFamily: 'Inter', fontSize: 13, fontWeight: 400, color: '#9CA3AF', zIndex: 7, name: 'Job Dates' }),
          text({ x: 80, y: 392, width: 700, height: 70, content: 'Owned end-to-end design for the core product, partnering closely with engineering and research.', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#4B5563', lineHeight: 1.5, zIndex: 8, name: 'Job Desc' }),
          text({ x: 80, y: 520, width: 400, height: 28, content: 'SKILLS', fontFamily: 'Inter', fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: 1, zIndex: 9, name: 'Skills Header' }),
          text({ x: 80, y: 560, width: 850, height: 30, content: 'Figma  ·  Design Systems  ·  Prototyping  ·  User Research  ·  Accessibility', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#4B5563', zIndex: 10, name: 'Skills List' }),
        ],
      }),
    });
  })(),

  // ---------- Flyers (1080x1350) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Event Flyer — Bold',
      category: 'Flyers',
      tags: ['flyer', 'event', 'bold', 'poster'],
      pageData: page({
        id: 'tpl-fly-1', width: 1080, height: 1350, backgroundColor: '#111827',
        elements: [
          frameSlot({ x: 0, y: 0, width: 1080, height: 700, shapeType: 'rectangle', cornerRadius: 0, zIndex: 0, name: 'Event Photo' }),
          shape({ x: 0, y: 640, width: 1080, height: 80, fill: '#111827', opacity: 0, zIndex: 1, name: 'Fade Spacer' }),
          text({ x: 80, y: 740, width: 920, height: 110, content: 'SUMMER\nMUSIC FEST', fontFamily: 'Plus Jakarta Sans', fontSize: 64, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.05, zIndex: 2, name: 'Title' }),
          shape({ x: 80, y: 940, width: 280, height: 60, fill: '#F59E0B', cornerRadius: 8, zIndex: 3, name: 'Date Badge' }),
          text({ x: 80, y: 958, width: 280, height: 30, content: 'AUG 24, 2026', fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: '#111827', textAlign: 'center', zIndex: 4, name: 'Date Text' }),
          text({ x: 80, y: 1030, width: 920, height: 40, content: 'Riverside Park · Gates open 4PM', fontFamily: 'Inter', fontSize: 24, fontWeight: 400, color: '#D1D5DB', zIndex: 5, name: 'Venue' }),
          text({ x: 80, y: 1200, width: 920, height: 50, content: 'Tickets at eventbrand.com', fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: '#F59E0B', zIndex: 6, name: 'CTA' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Sale Flyer — Big Number',
      category: 'Flyers',
      tags: ['flyer', 'sale', 'retail', 'promo'],
      pageData: page({
        id: 'tpl-fly-2', width: 1080, height: 1350, backgroundColor: '#DC2626',
        elements: [
          text({ x: 40, y: 140, width: 1000, height: 260, content: '50% OFF', fontFamily: 'Plus Jakarta Sans', fontSize: 140, fontWeight: 800, color: '#FFFFFF', textAlign: 'center', zIndex: 0, name: 'Big Number' }),
          text({ x: 40, y: 400, width: 1000, height: 50, content: 'EVERYTHING MUST GO', fontFamily: 'Inter', fontSize: 32, fontWeight: 700, color: '#FEE2E2', textAlign: 'center', letterSpacing: 2, zIndex: 1, name: 'Subtitle' }),
          frameSlot({ x: 290, y: 500, width: 500, height: 500, shapeType: 'rectangle', cornerRadius: 24, zIndex: 2, name: 'Product Photo' }),
          shape({ x: 340, y: 1060, width: 400, height: 80, fill: '#FFFFFF', cornerRadius: 40, zIndex: 3, name: 'CTA Button' }),
          text({ x: 340, y: 1085, width: 400, height: 30, content: 'SHOP THE SALE', fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: '#DC2626', textAlign: 'center', zIndex: 4, name: 'CTA Text' }),
          text({ x: 40, y: 1180, width: 1000, height: 30, content: 'In-store & online · Ends Sunday', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, color: '#FEE2E2', textAlign: 'center', zIndex: 5, name: 'Fine Print' }),
        ],
      }),
    });
  })(),

  // ---------- Certificates (1600x1200) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Certificate — Classic Border',
      category: 'Certificates',
      tags: ['certificate', 'award', 'classic', 'formal'],
      pageData: page({
        id: 'tpl-cert-1', width: 1600, height: 1200, backgroundColor: '#FFFDF7',
        elements: [
          shape({ x: 40, y: 40, width: 1520, height: 1120, fill: 'transparent', stroke: '#B8860B', strokeWidth: 4, cornerRadius: 0, zIndex: 0, name: 'Outer Border' }),
          shape({ x: 64, y: 64, width: 1472, height: 1072, fill: 'transparent', stroke: '#B8860B', strokeWidth: 1, cornerRadius: 0, zIndex: 1, name: 'Inner Border' }),
          text({ x: 200, y: 150, width: 1200, height: 50, content: 'CERTIFICATE OF ACHIEVEMENT', fontFamily: 'Inter', fontSize: 26, fontWeight: 700, color: '#B8860B', textAlign: 'center', letterSpacing: 4, zIndex: 2, name: 'Eyebrow' }),
          text({ x: 200, y: 260, width: 1200, height: 100, content: 'This certificate is proudly presented to', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#57534E', textAlign: 'center', zIndex: 3, name: 'Presented To' }),
          text({ x: 200, y: 360, width: 1200, height: 100, content: 'Recipient Name', fontFamily: 'Playfair Display', fontSize: 60, fontWeight: 700, color: '#1C1917', textAlign: 'center', zIndex: 4, name: 'Recipient' }),
          line({ x: 550, y: 470, width: 500, height: 2, fill: '#B8860B', zIndex: 5, name: 'Name Underline' }),
          text({ x: 300, y: 510, width: 1000, height: 90, content: 'in recognition of outstanding dedication and performance', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#57534E', textAlign: 'center', zIndex: 6, name: 'Description' }),
          frameSlot({ x: 730, y: 630, width: 140, height: 140, shapeType: 'circle', cornerRadius: 0, zIndex: 7, name: 'Seal' }),
          line({ x: 240, y: 1020, width: 300, height: 2, fill: '#57534E', zIndex: 8, name: 'Signature Line 1' }),
          text({ x: 240, y: 1035, width: 300, height: 30, content: 'Program Director', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#57534E', textAlign: 'center', zIndex: 9, name: 'Signature Label 1' }),
          line({ x: 1060, y: 1020, width: 300, height: 2, fill: '#57534E', zIndex: 10, name: 'Signature Line 2' }),
          text({ x: 1060, y: 1035, width: 300, height: 30, content: 'Date', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#57534E', textAlign: 'center', zIndex: 11, name: 'Signature Label 2' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Certificate — Modern Minimal',
      category: 'Certificates',
      tags: ['certificate', 'award', 'modern', 'minimal'],
      pageData: page({
        id: 'tpl-cert-2', width: 1600, height: 1200, backgroundColor: '#FFFFFF',
        elements: [
          shape({ x: 0, y: 0, width: 1600, height: 20, fill: '#0EA5E9', zIndex: 0, name: 'Top Bar' }),
          text({ x: 200, y: 140, width: 1200, height: 50, content: 'CERTIFICATE OF COMPLETION', fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#0EA5E9', textAlign: 'center', letterSpacing: 3, zIndex: 1, name: 'Eyebrow' }),
          text({ x: 200, y: 320, width: 1200, height: 90, content: 'Recipient Name', fontFamily: 'Plus Jakarta Sans', fontSize: 56, fontWeight: 800, color: '#0F172A', textAlign: 'center', zIndex: 2, name: 'Recipient' }),
          text({ x: 300, y: 430, width: 1000, height: 60, content: 'has successfully completed the course', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#64748B', textAlign: 'center', zIndex: 3, name: 'Description' }),
          text({ x: 300, y: 490, width: 1000, height: 60, content: 'Advanced Data Analytics', fontFamily: 'Inter', fontSize: 28, fontWeight: 700, color: '#0F172A', textAlign: 'center', zIndex: 4, name: 'Course Name' }),
          frameSlot({ x: 730, y: 620, width: 140, height: 140, shapeType: 'circle', zIndex: 5, name: 'Seal' }),
          line({ x: 260, y: 1000, width: 280, height: 2, fill: '#CBD5E1', zIndex: 6, name: 'Signature Line 1' }),
          text({ x: 260, y: 1015, width: 280, height: 28, content: 'Instructor', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#64748B', textAlign: 'center', zIndex: 7, name: 'Signature Label 1' }),
          line({ x: 1060, y: 1000, width: 280, height: 2, fill: '#CBD5E1', zIndex: 8, name: 'Signature Line 2' }),
          text({ x: 1060, y: 1015, width: 280, height: 28, content: 'Date Issued', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#64748B', textAlign: 'center', zIndex: 9, name: 'Signature Label 2' }),
        ],
      }),
    });
  })(),

  // ---------- Business Cards (1050x600) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Business Card — Bold Split',
      category: 'Business Cards',
      tags: ['business card', 'bold', 'split'],
      pageData: page({
        id: 'tpl-bc-1', width: 1050, height: 600, backgroundColor: '#FFFFFF',
        elements: [
          shape({ x: 0, y: 0, width: 380, height: 600, fill: '#111827', zIndex: 0, name: 'Color Block' }),
          frameSlot({ x: 130, y: 80, width: 120, height: 120, shapeType: 'circle', zIndex: 1, name: 'Logo Mark' }),
          text({ x: 60, y: 230, width: 260, height: 34, content: 'NOVA', fontFamily: 'Plus Jakarta Sans', fontSize: 28, fontWeight: 800, color: '#FFFFFF', textAlign: 'center', letterSpacing: 3, zIndex: 2, name: 'Company' }),
          text({ x: 60, y: 268, width: 260, height: 24, content: 'Creative Studio', fontFamily: 'Inter', fontSize: 14, fontWeight: 400, color: '#9CA3AF', textAlign: 'center', zIndex: 3, name: 'Tagline' }),
          text({ x: 440, y: 160, width: 550, height: 44, content: 'Jamie Rivera', fontFamily: 'Plus Jakarta Sans', fontSize: 32, fontWeight: 700, color: '#111827', zIndex: 4, name: 'Name' }),
          text({ x: 440, y: 208, width: 550, height: 30, content: 'Creative Director', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, color: '#6B7280', zIndex: 5, name: 'Title' }),
          line({ x: 440, y: 270, width: 80, height: 3, fill: '#111827', zIndex: 6, name: 'Divider' }),
          text({ x: 440, y: 320, width: 550, height: 26, content: 'jamie@novastudio.com', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#374151', zIndex: 7, name: 'Email' }),
          text({ x: 440, y: 354, width: 550, height: 26, content: '+1 (555) 234-5678', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#374151', zIndex: 8, name: 'Phone' }),
          text({ x: 440, y: 388, width: 550, height: 26, content: 'novastudio.com', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#374151', zIndex: 9, name: 'Website' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Business Card — Minimal Photo',
      category: 'Business Cards',
      tags: ['business card', 'minimal', 'photo'],
      pageData: page({
        id: 'tpl-bc-2', width: 1050, height: 600, backgroundColor: '#F8FAFC',
        elements: [
          frameSlot({ x: 60, y: 60, width: 130, height: 130, shapeType: 'circle', zIndex: 0, name: 'Photo' }),
          text({ x: 60, y: 220, width: 500, height: 38, content: 'Dana Whitfield', fontFamily: 'Plus Jakarta Sans', fontSize: 30, fontWeight: 700, color: '#0F172A', zIndex: 1, name: 'Name' }),
          text({ x: 60, y: 262, width: 500, height: 28, content: 'Real Estate Consultant', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#64748B', zIndex: 2, name: 'Title' }),
          line({ x: 60, y: 330, width: 930, height: 2, fill: '#CBD5E1', zIndex: 3, name: 'Divider' }),
          text({ x: 60, y: 370, width: 400, height: 26, content: 'dana@homesbywhitfield.com', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#334155', zIndex: 4, name: 'Email' }),
          text({ x: 60, y: 404, width: 400, height: 26, content: '+1 (555) 876-1234', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#334155', zIndex: 5, name: 'Phone' }),
          text({ x: 640, y: 370, width: 350, height: 26, content: 'homesbywhitfield.com', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#334155', textAlign: 'right', zIndex: 6, name: 'Website' }),
          text({ x: 640, y: 404, width: 350, height: 26, content: '128 Market St, Suite 4', fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#334155', textAlign: 'right', zIndex: 7, name: 'Address' }),
        ],
      }),
    });
  })(),

  // ---------- Posters (1200x1800) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Poster — Event Bold',
      category: 'Posters',
      tags: ['poster', 'event', 'bold'],
      pageData: page({
        id: 'tpl-pos-1', width: 1200, height: 1800, backgroundColor: '#0F172A',
        elements: [
          frameSlot({ x: 0, y: 0, width: 1200, height: 1000, shapeType: 'rectangle', zIndex: 0, name: 'Hero Photo' }),
          text({ x: 80, y: 1060, width: 1040, height: 200, content: 'NIGHT\nMARKET', fontFamily: 'Plus Jakarta Sans', fontSize: 96, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.0, zIndex: 1, name: 'Title' }),
          text({ x: 80, y: 1300, width: 1040, height: 50, content: 'Every Friday · 6PM — Midnight', fontFamily: 'Inter', fontSize: 28, fontWeight: 400, color: '#FACC15', zIndex: 2, name: 'Details' }),
          line({ x: 80, y: 1400, width: 200, height: 4, fill: '#FACC15', zIndex: 3, name: 'Divider' }),
          text({ x: 80, y: 1440, width: 1040, height: 90, content: 'Food trucks, live music, and local artisans — downtown riverfront.', fontFamily: 'Inter', fontSize: 22, fontWeight: 400, color: '#CBD5E1', lineHeight: 1.5, zIndex: 4, name: 'Body' }),
          text({ x: 80, y: 1650, width: 1040, height: 40, content: 'nightmarket.city', fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#FFFFFF', zIndex: 5, name: 'Website' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Poster — Minimal Typographic',
      category: 'Posters',
      tags: ['poster', 'minimal', 'typography'],
      pageData: page({
        id: 'tpl-pos-2', width: 1200, height: 1800, backgroundColor: '#FAF9F6',
        elements: [
          text({ x: 80, y: 200, width: 1040, height: 26, content: 'ANNUAL', fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: '#78716C', letterSpacing: 6, zIndex: 0, name: 'Eyebrow' }),
          text({ x: 80, y: 260, width: 1040, height: 420, content: 'JAZZ\nFESTIVAL', fontFamily: 'Playfair Display', fontSize: 130, fontWeight: 700, color: '#1C1917', lineHeight: 1.0, zIndex: 1, name: 'Title' }),
          line({ x: 80, y: 750, width: 300, height: 3, fill: '#1C1917', zIndex: 2, name: 'Divider' }),
          text({ x: 80, y: 800, width: 1040, height: 40, content: 'October 3–5, 2026', fontFamily: 'Inter', fontSize: 30, fontWeight: 400, color: '#44403C', zIndex: 3, name: 'Dates' }),
          text({ x: 80, y: 850, width: 1040, height: 40, content: 'Harbor Green Park', fontFamily: 'Inter', fontSize: 24, fontWeight: 400, color: '#78716C', zIndex: 4, name: 'Venue' }),
          frameSlot({ x: 80, y: 1350, width: 1040, height: 340, shapeType: 'rectangle', cornerRadius: 12, zIndex: 5, name: 'Photo' }),
        ],
      }),
    });
  })(),

  // ---------- Logos (500x500) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Logo — Badge Circle',
      category: 'Logos',
      tags: ['logo', 'badge', 'circle'],
      pageData: page({
        id: 'tpl-logo-1', width: 500, height: 500, backgroundColor: '#FFFFFF',
        elements: [
          shape({ x: 100, y: 90, width: 300, height: 300, shapeType: 'circle', fill: 'transparent', stroke: '#111827', strokeWidth: 6, zIndex: 0, name: 'Ring' }),
          text({ x: 100, y: 195, width: 300, height: 100, content: 'MK', fontFamily: 'Plus Jakarta Sans', fontSize: 84, fontWeight: 800, color: '#111827', textAlign: 'center', zIndex: 1, name: 'Initials' }),
          text({ x: 60, y: 410, width: 380, height: 30, content: 'MAKER & CO', fontFamily: 'Inter', fontSize: 20, fontWeight: 700, color: '#111827', textAlign: 'center', letterSpacing: 4, zIndex: 2, name: 'Wordmark' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Logo — Modern Wordmark',
      category: 'Logos',
      tags: ['logo', 'wordmark', 'modern'],
      pageData: page({
        id: 'tpl-logo-2', width: 500, height: 500, backgroundColor: '#FFFFFF',
        elements: [
          shape({ x: 175, y: 130, width: 150, height: 150, shapeType: 'hexagon', fill: '#10B981', zIndex: 0, name: 'Mark' }),
          text({ x: 40, y: 320, width: 420, height: 60, content: 'flux', fontFamily: 'Plus Jakarta Sans', fontSize: 56, fontWeight: 800, color: '#111827', textAlign: 'center', zIndex: 1, name: 'Wordmark' }),
          text({ x: 40, y: 385, width: 420, height: 26, content: 'STUDIO', fontFamily: 'Inter', fontSize: 16, fontWeight: 700, color: '#10B981', textAlign: 'center', letterSpacing: 5, zIndex: 2, name: 'Tagline' }),
        ],
      }),
    });
  })(),

  // ---------- Wedding Cards (1080x1350) ----------
  (() => {
    newTemplate();
    return template({
      name: 'Wedding Invitation — Elegant',
      category: 'Wedding Cards',
      tags: ['wedding', 'invitation', 'elegant'],
      pageData: page({
        id: 'tpl-wed-1', width: 1080, height: 1350, backgroundColor: '#FBF3EF',
        elements: [
          shape({ x: 40, y: 40, width: 1000, height: 1270, fill: 'transparent', stroke: '#C9A27E', strokeWidth: 2, zIndex: 0, name: 'Border' }),
          frameSlot({ x: 390, y: 110, width: 300, height: 300, shapeType: 'circle', zIndex: 1, name: 'Couple Photo' }),
          text({ x: 140, y: 460, width: 800, height: 26, content: 'TOGETHER WITH THEIR FAMILIES', fontFamily: 'Inter', fontSize: 16, fontWeight: 700, color: '#B08968', textAlign: 'center', letterSpacing: 3, zIndex: 2, name: 'Eyebrow' }),
          text({ x: 90, y: 510, width: 900, height: 110, content: 'Emma & Noah', fontFamily: 'Playfair Display', fontSize: 68, fontWeight: 700, color: '#3F3229', textAlign: 'center', zIndex: 3, name: 'Names' }),
          text({ x: 140, y: 630, width: 800, height: 40, content: 'request the pleasure of your company', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#6B5B4F', textAlign: 'center', zIndex: 4, name: 'Body' }),
          line({ x: 440, y: 710, width: 200, height: 2, fill: '#C9A27E', zIndex: 5, name: 'Divider' }),
          text({ x: 140, y: 760, width: 800, height: 44, content: 'Saturday, June 20th, 2026', fontFamily: 'Playfair Display', fontSize: 30, fontWeight: 700, color: '#3F3229', textAlign: 'center', zIndex: 6, name: 'Date' }),
          text({ x: 140, y: 815, width: 800, height: 34, content: 'Four o’clock in the afternoon', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#6B5B4F', textAlign: 'center', zIndex: 7, name: 'Time' }),
          text({ x: 140, y: 870, width: 800, height: 34, content: 'The Rosewood Garden, Napa Valley', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#6B5B4F', textAlign: 'center', zIndex: 8, name: 'Venue' }),
        ],
      }),
    });
  })(),
  (() => {
    newTemplate();
    return template({
      name: 'Wedding Invitation — Botanical',
      category: 'Wedding Cards',
      tags: ['wedding', 'invitation', 'botanical', 'green'],
      pageData: page({
        id: 'tpl-wed-2', width: 1080, height: 1350, backgroundColor: '#EFF3EC',
        elements: [
          shape({ x: 0, y: 0, width: 1080, height: 16, fill: '#5B7A5B', zIndex: 0, name: 'Top Bar' }),
          frameSlot({ x: 290, y: 100, width: 500, height: 560, shapeType: 'rectangle', cornerRadius: 12, zIndex: 1, name: 'Couple Photo' }),
          text({ x: 90, y: 720, width: 900, height: 90, content: 'Olivia & Ethan', fontFamily: 'Playfair Display', fontSize: 60, fontWeight: 700, color: '#33422F', textAlign: 'center', zIndex: 2, name: 'Names' }),
          text({ x: 140, y: 820, width: 800, height: 34, content: 'are getting married', fontFamily: 'Inter', fontSize: 22, fontWeight: 400, color: '#5B7A5B', textAlign: 'center', zIndex: 3, name: 'Body' }),
          line({ x: 440, y: 890, width: 200, height: 2, fill: '#5B7A5B', zIndex: 4, name: 'Divider' }),
          text({ x: 140, y: 940, width: 800, height: 40, content: 'September 12, 2026 · 3:00 PM', fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#33422F', textAlign: 'center', zIndex: 5, name: 'Date' }),
          text({ x: 140, y: 990, width: 800, height: 34, content: 'Willowbrook Farm, Vermont', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, color: '#5B7A5B', textAlign: 'center', zIndex: 6, name: 'Venue' }),
          text({ x: 140, y: 1060, width: 800, height: 34, content: 'RSVP by August 1st', fontFamily: 'Inter', fontSize: 17, fontWeight: 400, color: '#7A8F72', textAlign: 'center', zIndex: 7, name: 'RSVP' }),
        ],
      }),
    });
  })(),
];
