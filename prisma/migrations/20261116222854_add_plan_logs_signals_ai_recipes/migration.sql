-- NOTE: PlanEntry.planId is NOT NULL; this assumes PlanEntry has no rows yet.

-- DropIndex
DROP INDEX "PlanEntry_userId_date_mealType_key";

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "cuisines" TEXT[],
ADD COLUMN     "goalRateKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "basedOnIds" TEXT[],
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ownerId" UUID,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'dataset';

-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN     "convertedForEquipment" TEXT[],
ADD COLUMN     "modifiedRecipe" JSONB,
ADD COLUMN     "planId" TEXT NOT NULL,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "calorieTarget" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteRecipe" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "recipeId" TEXT NOT NULL,
    "convertedSteps" TEXT[],
    "convertedForEquipment" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLog" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "planEntryId" TEXT,
    "date" DATE NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'dinner',
    "status" TEXT NOT NULL,
    "loggedCalories" DOUBLE PRECISION,
    "loggedProteinG" DOUBLE PRECISION,
    "loggedCarbsG" DOUBLE PRECISION,
    "loggedFatG" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRecipeSignal" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "recipeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRecipeSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTagAffinity" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "UserTagAffinity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_userId_weekStart_key" ON "WeeklyPlan"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteRecipe_userId_recipeId_key" ON "FavoriteRecipe"("userId", "recipeId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_planId_idx" ON "ShoppingListItem"("planId");

-- CreateIndex
CREATE INDEX "MealLog_userId_date_idx" ON "MealLog"("userId", "date");

-- CreateIndex
CREATE INDEX "UserRecipeSignal_userId_createdAt_idx" ON "UserRecipeSignal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserTagAffinity_userId_tag_key" ON "UserTagAffinity"("userId", "tag");

-- CreateIndex
CREATE INDEX "Recipe_ownerId_idx" ON "Recipe"("ownerId");

-- CreateIndex
CREATE INDEX "PlanEntry_planId_idx" ON "PlanEntry"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntry_userId_date_mealType_position_key" ON "PlanEntry"("userId", "date", "mealType", "position");

-- CreateIndex
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteRecipe" ADD CONSTRAINT "FavoriteRecipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteRecipe" ADD CONSTRAINT "FavoriteRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_planEntryId_fkey" FOREIGN KEY ("planEntryId") REFERENCES "PlanEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecipeSignal" ADD CONSTRAINT "UserRecipeSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecipeSignal" ADD CONSTRAINT "UserRecipeSignal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTagAffinity" ADD CONSTRAINT "UserTagAffinity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security on the new tables (same reason as the init migration).
ALTER TABLE "WeeklyPlan"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FavoriteRecipe"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShoppingListItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealLog"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRecipeSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserTagAffinity"  ENABLE ROW LEVEL SECURITY;
