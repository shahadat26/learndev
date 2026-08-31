import { PrismaClient } from '@prisma/client';

/**
 * Idempotent seed: every write is an `upsert` keyed on a natural unique column,
 * so running it twice (or on every deploy) converges to the same state instead
 * of duplicating rows or crashing on a unique constraint.
 *
 *   npm run prisma:seed
 */
const prisma = new PrismaClient();

interface CategorySeed {
  name: string;
  slug: string;
  description: string;
}

interface ProductSeed {
  sku: string;
  name: string;
  slug: string;
  description: string;
  /** Minor units. 18999 = $189.99 - integers only, never a float. */
  priceCents: number;
  stock: number;
  imageUrl: string;
  categorySlug: string;
}

const categories: CategorySeed[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Audio, peripherals and everything with a battery in it.',
  },
  {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    description: 'Tools that earn their place on the counter.',
  },
  {
    name: 'Outdoors',
    slug: 'outdoors',
    description: 'Gear for weekends that start before sunrise.',
  },
];

const products: ProductSeed[] = [
  {
    sku: 'ELEC-HEADPHONES-01',
    name: 'Aurora Wireless Headphones',
    slug: 'aurora-wireless-headphones',
    description:
      'Over-ear active noise cancelling headphones with a 40 hour battery and USB-C fast charge.',
    priceCents: 18999,
    stock: 42,
    imageUrl: 'https://picsum.photos/seed/aurora-headphones/600/600',
    categorySlug: 'electronics',
  },
  {
    sku: 'ELEC-KEYBOARD-01',
    name: 'Nimbus Mechanical Keyboard',
    slug: 'nimbus-mechanical-keyboard',
    description:
      'Hot-swappable 75% mechanical keyboard with tactile switches and a machined aluminium case.',
    priceCents: 12450,
    stock: 65,
    imageUrl: 'https://picsum.photos/seed/nimbus-keyboard/600/600',
    categorySlug: 'electronics',
  },
  {
    sku: 'ELEC-WEBCAM-01',
    name: 'Vertex 4K Webcam',
    slug: 'vertex-4k-webcam',
    description:
      '4K60 webcam with a physical privacy shutter, dual noise-cancelling mics and auto light correction.',
    priceCents: 8999,
    stock: 28,
    imageUrl: 'https://picsum.photos/seed/vertex-webcam/600/600',
    categorySlug: 'electronics',
  },
  {
    sku: 'HOME-KETTLE-01',
    name: 'Thermo Gooseneck Kettle',
    slug: 'thermo-gooseneck-kettle',
    description:
      'Variable temperature pour-over kettle with a 60 minute hold and a stainless steel gooseneck spout.',
    priceCents: 6750,
    stock: 33,
    imageUrl: 'https://picsum.photos/seed/thermo-kettle/600/600',
    categorySlug: 'home-kitchen',
  },
  {
    sku: 'HOME-CHEFKNIFE-01',
    name: 'Santoku Chef Knife 18cm',
    slug: 'santoku-chef-knife-18cm',
    description:
      'High-carbon stainless santoku with a hollow-ground edge and a full tang pakkawood handle.',
    priceCents: 4599,
    stock: 71,
    imageUrl: 'https://picsum.photos/seed/santoku-knife/600/600',
    categorySlug: 'home-kitchen',
  },
  {
    sku: 'HOME-ESPRESSO-01',
    name: 'Crema Espresso Machine',
    slug: 'crema-espresso-machine',
    description:
      'Dual boiler espresso machine with PID temperature control, a 58mm portafilter and a steam wand.',
    priceCents: 42900,
    stock: 9,
    imageUrl: 'https://picsum.photos/seed/crema-espresso/600/600',
    categorySlug: 'home-kitchen',
  },
  {
    sku: 'OUT-TENT-01',
    name: 'Ridgeline 2-Person Tent',
    slug: 'ridgeline-2-person-tent',
    description:
      'Three season freestanding tent, 2.4kg packed, with a full-coverage fly and two vestibules.',
    priceCents: 21999,
    stock: 17,
    imageUrl: 'https://picsum.photos/seed/ridgeline-tent/600/600',
    categorySlug: 'outdoors',
  },
  {
    sku: 'OUT-BOTTLE-01',
    name: 'Summit Insulated Bottle 1L',
    slug: 'summit-insulated-bottle-1l',
    description:
      'Vacuum insulated 1 litre bottle: 24 hours cold, 12 hours hot, leak-proof lid, dishwasher safe.',
    priceCents: 3200,
    stock: 120,
    imageUrl: 'https://picsum.photos/seed/summit-bottle/600/600',
    categorySlug: 'outdoors',
  },
];

async function main(): Promise<void> {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description },
      create: category,
    });
  }
  console.log(`Seeded ${categories.length} categories`);

  for (const { categorySlug, ...product } of products) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: categorySlug },
      select: { id: true },
    });

    await prisma.product.upsert({
      where: { sku: product.sku },
      update: { ...product, categoryId: category.id },
      create: { ...product, categoryId: category.id },
    });
  }
  console.log(`Seeded ${products.length} products`);
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
