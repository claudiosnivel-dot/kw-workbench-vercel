-- CreateEnum
CREATE TYPE "ThemeMode" AS ENUM ('DARK', 'LIGHT');

-- CreateEnum
CREATE TYPE "FontScaleMode" AS ENUM ('NORMAL', 'LARGE');

-- CreateEnum
CREATE TYPE "ColorVisionMode" AS ENUM ('NONE', 'PROTANOPIA', 'DEUTERANOPIA', 'TRITANOPIA');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "theme_mode" "ThemeMode",
ADD COLUMN "font_scale_mode" "FontScaleMode",
ADD COLUMN "color_vision_mode" "ColorVisionMode";

-- Backfill defaults for existing records
UPDATE "users"
SET
  "theme_mode" = 'DARK',
  "font_scale_mode" = 'NORMAL',
  "color_vision_mode" = 'NONE'
WHERE
  "theme_mode" IS NULL
  OR "font_scale_mode" IS NULL
  OR "color_vision_mode" IS NULL;

-- Set defaults and required constraints
ALTER TABLE "users"
ALTER COLUMN "theme_mode" SET DEFAULT 'DARK',
ALTER COLUMN "theme_mode" SET NOT NULL,
ALTER COLUMN "font_scale_mode" SET DEFAULT 'NORMAL',
ALTER COLUMN "font_scale_mode" SET NOT NULL,
ALTER COLUMN "color_vision_mode" SET DEFAULT 'NONE',
ALTER COLUMN "color_vision_mode" SET NOT NULL;