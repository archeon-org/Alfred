import { DataSource } from 'typeorm';
import { config } from 'dotenv';

import templatesData from './templates.json';
import {
  TemplateCategoryEntity,
  TemplateEntity,
  TemplateTagEntity,
} from '@archeon-org/database';

// Load .env variables
config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'archeon_db',
  entities: [TemplateEntity, TemplateCategoryEntity, TemplateTagEntity],
  synchronize: false,
});

const seed = async () => {
  console.log('🌱 Connecting to Database...');
  await AppDataSource.initialize();
  console.log('✅ Connected.');

  const templateRepo = AppDataSource.getRepository(TemplateEntity);
  const categoryRepo = AppDataSource.getRepository(TemplateCategoryEntity);
  const tagRepo = AppDataSource.getRepository(TemplateTagEntity);

  // --- EXECUTION ---
  console.log('🔄 Syncing Templates...');

  // 1. Get all existing templates
  const existingTemplates = await templateRepo.find({
    relations: ['categories', 'tags'],
  });
  const seedTemplateNames = templatesData.map((t) => t.name);

  // 2. Remove templates that are not in the seed data
  const templatesToRemove = existingTemplates.filter(
    (t) => !seedTemplateNames.includes(t.name),
  );
  if (templatesToRemove.length > 0) {
    console.log(
      `🗑️ Removing ${templatesToRemove.length} deprecated templates...`,
    );
    await templateRepo.remove(templatesToRemove);
  }

  // 3. Create or Update templates
  for (const tplData of templatesData) {
    let template = await templateRepo.findOne({
      where: { name: tplData.name },
      relations: ['categories', 'tags'],
    });

    if (template) {
      // UPDATE
      console.log(`   > Updating Pack: ${tplData.name}`);
      template.description = tplData.description;
      template.icon = tplData.icon;
      template.order = tplData.order;
      await templateRepo.save(template);

      // Reconcile Categories (Delete all and recreate for simplicity and consistency)
      await categoryRepo.delete({ template: { id: template.id } });
      const categories = tplData.categories.map((c) =>
        categoryRepo.create({ ...c, template }),
      );
      await categoryRepo.save(categories);

      // Reconcile Tags (Delete all and recreate)
      await tagRepo.delete({ template: { id: template.id } });
      const tags = tplData.tags.map((t) => tagRepo.create({ ...t, template }));
      await tagRepo.save(tags);
    } else {
      // CREATE
      console.log(`   > Creating Pack: ${tplData.name}`);
      template = templateRepo.create({
        name: tplData.name,
        description: tplData.description,
        icon: tplData.icon,
        order: tplData.order,
      });
      const savedTemplate = await templateRepo.save(template);

      const categories = tplData.categories.map((c) =>
        categoryRepo.create({ ...c, template: savedTemplate }),
      );
      await categoryRepo.save(categories);

      const tags = tplData.tags.map((t) =>
        tagRepo.create({ ...t, template: savedTemplate }),
      );
      await tagRepo.save(tags);
    }
  }

  console.log('✨ Seeding Complete!');
  await AppDataSource.destroy();
};

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
