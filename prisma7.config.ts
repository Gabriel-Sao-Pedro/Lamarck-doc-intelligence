// Este arquivo foi gerado pelo Prisma e assume que você já instalou:
// npm install --save-dev prisma dotenv
// (Nota: se este arquivo for regenerado pelo `prisma init`, o comentário
// original volta em inglês — o Prisma controla essa geração, não o projeto.)
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
