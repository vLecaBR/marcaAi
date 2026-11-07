using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MarcaAi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class V1_PaymentHold_Reschedule_PayOnSite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "payOnSite",
                table: "event_types",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "paymentDueAt",
                table: "bookings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rescheduleCount",
                table: "bookings",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "payOnSite",
                table: "event_types");

            migrationBuilder.DropColumn(
                name: "paymentDueAt",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "rescheduleCount",
                table: "bookings");
        }
    }
}
