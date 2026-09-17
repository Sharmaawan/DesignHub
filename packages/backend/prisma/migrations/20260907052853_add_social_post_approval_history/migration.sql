-- AlterTable
ALTER TABLE `product_updates` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🚀';

-- CreateTable
CREATE TABLE `social_post_approval_history` (
    `id` VARCHAR(191) NOT NULL,
    `social_post_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `social_post_approval_history_social_post_id_idx`(`social_post_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `social_post_approval_history` ADD CONSTRAINT `social_post_approval_history_social_post_id_fkey` FOREIGN KEY (`social_post_id`) REFERENCES `social_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
