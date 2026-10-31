import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, sendSuccess } from "../lib/http.js";
import { loginSchema } from "../validators/auth.js";

export const login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.role !== "ADMIN" || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
  );
  return sendSuccess(res, {
    token,
    admin: { id: user.id, name: user.name, email: user.email, role: user.role },
  }, { message: "Welcome back." });
});

export const getCurrentAdmin = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    admin: {
      id: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
    },
  });
});
