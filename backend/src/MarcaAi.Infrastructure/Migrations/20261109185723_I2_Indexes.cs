using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MarcaAi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class I2_Indexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_bookings_paymentDueAt_pending",
                table: "bookings",
                column: "paymentDueAt",
                filter: "status = 'PENDING' AND \"paymentDueAt\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_bookings_userId_endTime",
                table: "bookings",
                columns: new[] { "userId", "endTime" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_bookings_paymentDueAt_pending",
                table: "bookings");

            migrationBuilder.DropIndex(
                name: "IX_bookings_userId_endTime",
                table: "bookings");
        }
    }
}
