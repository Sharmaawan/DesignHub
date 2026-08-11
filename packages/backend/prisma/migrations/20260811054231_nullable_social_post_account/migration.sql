-- DropForeignKey
ALTER TABLE `social_posts` DROP FOREIGN KEY `social_posts_social_account_id_fkey`;

-- AlterTable
ALTER TABLE `product_updates` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '🚀';

-- AlterTable
ALTER TABLE `social_posts` MODIFY `social_account_id` VARCHAR(191) NULL,
    MODIFY `platform` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `social_posts` ADD CONSTRAINT `social_posts_social_account_id_fkey` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
