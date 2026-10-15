import { z } from 'zod';
import { slugSchema } from './catalog.js';

// Food & drinks ordered with a booking (optional step after the tickets).

/** In display order (the category tabs). */
export const menuCategorySchema = z.enum([
  'POPCORN',
  'DRINK',
  'SNACK',
  'NACHOS',
  'HOT_DOG',
  'VIP_DISH',
  'COMBO',
]);
export type MenuCategory = z.infer<typeof menuCategorySchema>;

export const fulfillmentSchema = z.enum(['PICKUP_AT_COUNTER', 'DELIVER_TO_SEAT']);
export type Fulfillment = z.infer<typeof fulfillmentSchema>;

/** Seat delivery only: before the film, or during it (about 20 minutes after the start). */
export const serveTimingSchema = z.enum(['BEFORE_SHOW', 'DURING_SHOW']);
export type ServeTiming = z.infer<typeof serveTimingSchema>;

/** Per order line, and for the whole food order of one booking. */
export const MAX_FOOD_QUANTITY_PER_ITEM = 20;
export const MAX_FOOD_ITEMS_PER_BOOKING = 40;

// --- GET /api/locations/:slug/menu ---

export const menuQuerySchema = z.object({ showtime: z.uuid().optional() }).strict();
export type MenuQuery = z.infer<typeof menuQuerySchema>;

export const menuItemSchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  category: menuCategorySchema,
  nameSq: z.string(),
  nameEn: z.string().nullable(),
  descriptionSq: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  imagePath: z.string().nullable(),
  /** The price at this cinema. */
  priceCents: z.int().min(0),
  isCombo: z.boolean(),
  /** What a combo contains (empty for other items). */
  components: z.array(
    z.object({
      slug: slugSchema,
      nameSq: z.string(),
      nameEn: z.string().nullable(),
      quantity: z.int().positive(),
    }),
  ),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const menuResponseSchema = z.object({
  location: z.object({ slug: slugSchema, name: z.string() }),
  items: z.array(menuItemSchema),
  /** With ?showtime=: whether its hall brings food to the seat; otherwise null. */
  seatDelivery: z.boolean().nullable(),
});
export type MenuResponse = z.infer<typeof menuResponseSchema>;

// --- PUT /api/bookings/:id/food ---

const foodLineSchema = z
  .object({
    menuItemId: z.uuid(),
    quantity: z.int().min(1).max(MAX_FOOD_QUANTITY_PER_ITEM),
    fulfillment: fulfillmentSchema,
    serveTiming: serveTimingSchema.optional(),
  })
  .strict()
  .refine((line) => (line.fulfillment === 'DELIVER_TO_SEAT') === (line.serveTiming !== undefined), {
    message: 'Seat delivery needs a serve timing; counter pickup has none.',
    path: ['serveTiming'],
  });

/** Replaces the booking's food order. Never prices: the server takes the cinema's prices. */
export const foodRequestSchema = z
  .object({ items: z.array(foodLineSchema).max(MAX_FOOD_ITEMS_PER_BOOKING) })
  .strict()
  .refine(
    (v) => v.items.reduce((sum, line) => sum + line.quantity, 0) <= MAX_FOOD_ITEMS_PER_BOOKING,
    { message: `At most ${String(MAX_FOOD_ITEMS_PER_BOOKING)} items in total.`, path: ['items'] },
  )
  .refine(
    (v) =>
      new Set(v.items.map((l) => `${l.menuItemId}:${l.fulfillment}:${l.serveTiming ?? ''}`))
        .size === v.items.length,
    { message: 'Each item appears once per fulfillment.', path: ['items'] },
  );
export type FoodRequest = z.infer<typeof foodRequestSchema>;

/** A food line of a booking, with its price snapshot. */
export const bookingFoodSchema = z.object({
  menuItemId: z.uuid(),
  nameSq: z.string(),
  nameEn: z.string().nullable(),
  quantity: z.int().positive(),
  unitPriceCents: z.int().min(0),
  totalCents: z.int().min(0),
  fulfillment: fulfillmentSchema,
  serveTiming: serveTimingSchema.nullable(),
});
export type BookingFood = z.infer<typeof bookingFoodSchema>;
