using MarcaAi.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace MarcaAi.Api.Controllers;

/// <summary>Recebe erros de renderização do front (error boundary) para o painel do dono. Anônimo, limitado e sem dado pessoal.</summary>
[ApiController]
[Route("api/v1/client-errors")]
[AllowAnonymous]
public sealed class ClientErrorsController(IErrorRecorder recorder) : ControllerBase
{
    public sealed record ClientError(string? Message, string? Digest, string? Path);

    [HttpPost]
    [EnableRateLimiting("client-errors")]
    public async Task<IActionResult> Post([FromBody] ClientError body, CancellationToken ct)
    {
        await recorder.RecordAsync("web", body.Message ?? "erro sem mensagem",
            string.IsNullOrWhiteSpace(body.Digest) ? null : "digest " + body.Digest, body.Path, null, ct);
        return NoContent();
    }
}
