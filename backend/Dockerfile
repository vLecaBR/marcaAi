# ==============================================================================
# MarcaAí — API .NET 10 (container; orquestrado pelo docker-compose na F9)
# Contexto de build = pasta `backend/`.
# Multi-stage: SDK compila/publica; runtime aspnet roda só o publicado, como não-root.
# ==============================================================================

# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore src/MarcaAi.Api/MarcaAi.Api.csproj
RUN dotnet publish src/MarcaAi.Api/MarcaAi.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Porta 8080 (padrão das imagens .NET 8+). TLS é terminado pelo Cloudflare/proxy.
ENV ASPNETCORE_HTTP_PORTS=8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

# Usuário não-root embutido nas imagens .NET 8+ (UID 1654).
USER app

ENTRYPOINT ["dotnet", "MarcaAi.Api.dll"]
