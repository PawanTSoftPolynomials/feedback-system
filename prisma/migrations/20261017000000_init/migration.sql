-- CreateTable
CREATE TABLE "respondents" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "mobile_key" TEXT NOT NULL,
    "college" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "submission_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "respondents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'lms',
    "role" TEXT NOT NULL DEFAULT 'student',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_attributes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'lms',
    "role" TEXT NOT NULL DEFAULT 'student',
    "scale" INTEGER NOT NULL DEFAULT 5,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "respondent_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "answers" JSONB NOT NULL DEFAULT '[]',
    "ratings" JSONB NOT NULL DEFAULT '[]',
    "comment" TEXT NOT NULL DEFAULT '',
    "submitted_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prizes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "winners" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "respondent_id" TEXT NOT NULL,
    "student" JSONB,
    "feedback" JSONB,
    "declared_at" TIMESTAMP(3) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_created_at" TIMESTAMP(3) NOT NULL,
    "allow_change" BOOLEAN NOT NULL DEFAULT false,
    "email_status" TEXT NOT NULL,
    "email_requested_at" TIMESTAMP(3),
    "email_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_error" TEXT,
    "email_sent_at" TIMESTAMP(3),
    "email_message_id" TEXT,

    CONSTRAINT "winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize_selections" (
    "id" TEXT NOT NULL,
    "winner_id" TEXT NOT NULL,
    "respondent_id" TEXT NOT NULL,
    "prize_id" TEXT NOT NULL,
    "prize_name" TEXT NOT NULL,
    "prize_type" TEXT NOT NULL DEFAULT '',
    "selected_at" TIMESTAMP(3) NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "prize_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "form_title" TEXT NOT NULL,
    "form_description" TEXT NOT NULL DEFAULT '',
    "form_open" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_accounts" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "storage_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "respondents_role_email_key" ON "respondents"("role", "email");

-- CreateIndex
CREATE UNIQUE INDEX "respondents_role_mobile_key_key" ON "respondents"("role", "mobile_key");

-- CreateIndex
CREATE INDEX "questions_role_category_sort_order_idx" ON "questions"("role", "category", "sort_order");

-- CreateIndex
CREATE INDEX "rating_attributes_role_category_sort_order_idx" ON "rating_attributes"("role", "category", "sort_order");

-- CreateIndex
CREATE INDEX "submissions_respondent_id_idx" ON "submissions"("respondent_id");

-- CreateIndex
CREATE INDEX "submissions_submitted_at_idx" ON "submissions"("submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "winners_submission_id_key" ON "winners"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "winners_token_hash_key" ON "winners"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "prize_selections_winner_id_key" ON "prize_selections"("winner_id");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "respondents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_selections" ADD CONSTRAINT "prize_selections_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "winners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_selections" ADD CONSTRAINT "prize_selections_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "prizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

