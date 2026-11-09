using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MarcaAi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class I2_Outbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "outbox_messages",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    channel = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    bookingUid = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    recipient = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    subject = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    body = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    nextAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    lastError = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    processedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_outbox_messages", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_outbox_messages_bookingUid",
                table: "outbox_messages",
                column: "bookingUid");

            migrationBuilder.CreateIndex(
                name: "IX_outbox_messages_status_nextAttemptAt",
                table: "outbox_messages",
                columns: new[] { "status", "nextAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_outbox_messages_status_processedAt",
                table: "outbox_messages",
                columns: new[] { "status", "processedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "outbox_messages");
        }
    }
}
