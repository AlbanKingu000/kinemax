// The demo menu (items, combos, per-location offers and prices), shared by the dev seed and the
// e2e catalog. Idempotent: items are upserted by slug, combos and offers rewritten.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { LOCATION_MENUS, MENU_ITEMS } from './data.js';

/** Where the generated illustration of an item is served from (apps/web/public/seed/menu). */
export const menuImagePath = (slug: string) => `/seed/menu/${slug}.svg`;

export async function seedMenu(prisma: PrismaClient, locationIds: Map<string, string>) {
  const ids = new Map<string, string>();
  for (const item of MENU_ITEMS) {
    const data = {
      slug: item.slug,
      nameSq: item.nameSq,
      nameEn: item.nameEn,
      descriptionSq: item.descriptionSq ?? null,
      descriptionEn: item.descriptionEn ?? null,
      category: item.category,
      isCombo: item.category === 'COMBO',
      isActive: true,
      imagePath: menuImagePath(item.slug),
    };
    const saved = await prisma.menuItem.upsert({
      where: { slug: item.slug },
      create: data,
      update: data,
    });
    ids.set(item.slug, saved.id);
  }
  for (const item of MENU_ITEMS.filter((i) => i.components)) {
    const comboId = ids.get(item.slug) ?? '';
    await prisma.comboComponent.deleteMany({ where: { comboId } });
    await prisma.comboComponent.createMany({
      data: (item.components ?? []).map((c) => ({
        comboId,
        componentId: ids.get(c.slug) ?? '',
        quantity: c.quantity,
      })),
    });
  }
  for (const [slug, menu] of Object.entries(LOCATION_MENUS)) {
    const locationId = locationIds.get(slug) ?? '';
    for (const item of MENU_ITEMS) {
      const menuItemId = ids.get(item.slug) ?? '';
      const priceCents = Math.round((item.priceCents * menu.priceFactor) / 10) * 10;
      const isAvailable = !menu.unavailable.includes(item.slug);
      const where = { locationId_menuItemId: { locationId, menuItemId } };
      if (isAvailable) {
        await prisma.locationMenuItem.upsert({
          where,
          create: { locationId, menuItemId, priceCents, isAvailable },
          update: { priceCents, isAvailable },
        });
      } else {
        await prisma.locationMenuItem.updateMany({
          where: { locationId, menuItemId },
          data: { isAvailable: false },
        });
      }
    }
  }
}
