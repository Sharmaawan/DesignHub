-- Maker/approver workflow for social posts.
ALTER TABLE `social_posts`
    ADD COLUMN `team_id` VARCHAR(191) NULL,
    ADD COLUMN `submitted_by_id` VARCHAR(191) NULL,
    ADD COLUMN `approved_by_id` VARCHAR(191) NULL,
    ADD COLUMN `approved_at` DATETIME(3) NULL,
    ADD COLUMN `rejection_reason` TEXT NULL;

CREATE INDEX `social_posts_team_id_status_idx` ON `social_posts`(`team_id`, `status`);
