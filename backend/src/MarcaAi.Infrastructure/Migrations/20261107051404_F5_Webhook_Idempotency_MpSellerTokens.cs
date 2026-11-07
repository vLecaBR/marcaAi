using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MarcaAi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class F5_Webhook_Idempotency_MpSellerTokens : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "encryptedAccessToken",
                table: "payout_accounts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "encryptedRefreshToken",
                table: "payout_accounts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "tokenExpiresAt",
                table: "payout_accounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "processed_webhook_events",
                columns: table => new
                {
                    provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    eventId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    processedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_processed_webhook_events", x => new { x.provider, x.eventId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_processed_webhook_events_processedAt",
                table: "processed_webhook_events",
                column: "processedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "processed_webhook_events");

            migrationBuilder.DropColumn(
                name: "encryptedAccessToken",
                table: "payout_accounts");

            migrationBuilder.DropColumn(
                name: "encryptedRefreshToken",
                table: "payout_accounts");

            migrationBuilder.DropColumn(
                name: "tokenExpiresAt",
                table: "payout_accounts");
        }
    }
}
