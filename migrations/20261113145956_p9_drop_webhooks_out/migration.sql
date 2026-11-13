/*
  Warnings:

  - You are about to drop the `WebhookEndpoint` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WebhookEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WebhookEndpoint" DROP CONSTRAINT "WebhookEndpoint_shop_fkey";

-- DropForeignKey
ALTER TABLE "WebhookEvent" DROP CONSTRAINT "WebhookEvent_endpoint_fkey";

-- DropTable
DROP TABLE "WebhookEndpoint";

-- DropTable
DROP TABLE "WebhookEvent";
