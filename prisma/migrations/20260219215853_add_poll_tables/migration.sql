-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('FOR', 'AGAINST', 'NEITHER');

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "for_title" TEXT NOT NULL,
    "for_argument" TEXT NOT NULL,
    "against_title" TEXT NOT NULL,
    "against_argument" TEXT NOT NULL,
    "neither_title" TEXT NOT NULL DEFAULT 'It''s not that simple',
    "neither_prompt" TEXT NOT NULL DEFAULT 'Here''s what needs to change:',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "neither_text" TEXT,
    "voter_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "polls_slug_key" ON "polls"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_poll_id_voter_token_key" ON "poll_votes"("poll_id", "voter_token");

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
