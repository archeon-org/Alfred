# Document & Category Templates

This folder documents the seeded template system used by Archeon to bootstrap user folder structures during onboarding.

## Scope

The seed source of truth is:
- `apps/gate/db/templates.json`

The seeding and application flow is implemented in:
- `apps/gate/db/seed.ts`
- `apps/gate/src/template/template.service.ts`

## What Is Seeded

Each template pack contains:
- Template metadata (`name`, `description`, `icon`, `order`)
- Root folders (`categories`)
- Subfolders (`children` under each category)
- Tags (`tags`)

The system now supports **2 hierarchy levels**:
- Level 1: root category
- Level 2: child category (subfolder)

No deeper level is created by seeds.

## Data Contract

### Template object (`templates.json`)
- `name: string` unique template name.
- `description: string` onboarding description.
- `icon: string` ionicon key.
- `order: number` display order in onboarding.
- `categories: CategoryNode[]` template folder tree.
- `tags: TagNode[]` template tags.

### Category node
- `name: string` folder name.
- `icon: string` ionicon key.
- `color: string` hex color.
- `order: number` order at same level.
- `children?: CategoryNode[]` optional level-2 folders.

### Tag node
- `name: string`
- `color: string`
- `order: number`

## Database Mapping

When seeded, template categories are stored with:
- `template_categories.parentTemplateCategoryId`
- `template_categories.level`

When a user applies a template, user categories are created with:
- `categories.parentId`
- `categories.order`

This preserves the same parent/child structure from the template pack in each user account.

## Seeded Catalog (Current)

Total packs: **8**

| Pack | Root Folders | Subfolders | Tags |
| --- | ---: | ---: | ---: |
| General Life | 9 | 33 | 10 |
| Freelancer Pro | 10 | 34 | 10 |
| Small Business Ops | 9 | 33 | 10 |
| Student & Research | 9 | 33 | 10 |
| Family Office | 9 | 32 | 10 |
| Landlord & Real Estate | 9 | 33 | 10 |
| Healthcare & Medical | 9 | 29 | 10 |
| Travel & Immigration | 9 | 29 | 10 |

## Design Principles Used

- Real-world organization domains (personal, professional, legal, medical, education, property, immigration).
- Explicit split between operational folders and archive folders.
- Stable naming that helps AI classification and user recognition.
- Balanced granularity: enough precision without over-fragmenting.
- Reusable tags for workflow state (`Urgent`, `Pending`, `Paid`, `Archive`, etc.).

## AI Classification Alignment

The classification stack reads user categories with hierarchy metadata:
- `id`
- `name`
- `parentId`
- `path` (e.g. `Finance/Taxes`)
- `level`
- `isLeaf`

The classifier then:
- Prefers existing folders, especially precise leaf folders.
- Uses hierarchy context for disambiguation.
- Can propose a new folder when no existing folder fits.
- Can attach new folders to an existing parent category.

## How To Update Template Packs Safely

1. Edit `apps/gate/db/templates.json`.
2. Keep category depth at max 2 levels.
3. Keep root and child `order` values deterministic.
4. Keep `icon` and `color` valid for UI consistency.
5. Run seed sync via Gate migration/seed pipeline.
6. Verify onboarding, category creation, and AI classification behavior.

## Validation Checklist

After editing seed templates:
- JSON is valid (`jq empty apps/gate/db/templates.json`).
- Gate service compiles.
- Template apply creates parent categories before children.
- Child categories keep correct `parentId`.
- Classification can resolve folders using `path` and `level`.

## Related Files

- `apps/gate/db/templates.json`
- `apps/gate/db/seed.ts`
- `apps/gate/db/migrations/1767000000000-add-folder-hierarchy.ts`
- `apps/gate/src/template/template.service.ts`
- `apps/scribe/src/repositories/document.py`
- `apps/scribe/src/services/classification/langgraph_workflow.py`
