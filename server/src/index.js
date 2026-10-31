import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { isAdmin, verifyJWT } from "./middleware/auth.js";
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import { taxRouter, templateRouter } from "./routes/catalogRoutes.js";
import { prisma } from "./lib/prisma.js";
import { HttpError } from "./lib/http.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters.");
}

const app = express();
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.get("/api/health", verifyJWT, isAdmin, (_req, res) => res.json({ success: true, data: { status: "ok" } }));
app.use("/api/products", verifyJWT, isAdmin, productRoutes);
app.use("/api/taxes", verifyJWT, isAdmin, taxRouter);
app.use("/api/quotation-templates", verifyJWT, isAdmin, templateRouter);
app.use((_req, _res, next) => {
  next(new HttpError(404, "Route not found."));
});
app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, () => console.log(`Brightloop API listening on port ${port}.`));

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
