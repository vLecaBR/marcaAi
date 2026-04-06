export function mapPrismaError(err: any, defaultMessage = "Erro interno no servidor"): string {
  if (err instanceof Error && err.name === "PrismaClientKnownRequestError") {
    const code = (err as any).code;
    switch (code) {
      case "P2002":
        return "Registro já existente. Este valor já está em uso.";
      case "P2025":
        return "Registro não encontrado.";
      case "P2034":
        return "Horário reservado simultaneamente ou conflito de transação.";
      default:
        return defaultMessage;
    }
  }

  if (err instanceof Error) {
    if (err.name === "ConflictError") return err.message;
    return err.message || defaultMessage;
  }

  return defaultMessage;
}
