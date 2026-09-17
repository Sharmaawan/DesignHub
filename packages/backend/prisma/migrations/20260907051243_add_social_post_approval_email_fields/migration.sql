-- AlterTable
ALTER TABLE `product_updates` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🚀';

-- AlterTable
ALTER TABLE `social_posts` ADD COLUMN `approval_message` TEXT NULL,
    ADD COLUMN `rejected_at` DATETIME(3) NULL,
    ADD COLUMN `rejected_by_id` VARCHAR(191) NULL;
