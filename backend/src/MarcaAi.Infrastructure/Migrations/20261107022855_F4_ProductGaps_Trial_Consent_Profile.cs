using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MarcaAi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class F4_ProductGaps_Trial_Consent_Profile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "clinicName",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "council",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "registrationNumber",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "specialty",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "trialEndsAt",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "trialEndsAt",
                table: "teams",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "consentAt",
                table: "bookings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "consentVersion",
                table: "bookings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "clinicName",
                table: "users");

            migrationBuilder.DropColumn(
                name: "council",
                table: "users");

            migrationBuilder.DropColumn(
                name: "registrationNumber",
                table: "users");

            migrationBuilder.DropColumn(
                name: "specialty",
                table: "users");

            migrationBuilder.DropColumn(
                name: "trialEndsAt",
                table: "users");

            migrationBuilder.DropColumn(
                name: "trialEndsAt",
                table: "teams");

            migrationBuilder.DropColumn(
                name: "consentAt",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "consentVersion",
                table: "bookings");
        }
    }
}
