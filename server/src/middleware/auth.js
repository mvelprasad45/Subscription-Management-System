import jwt from "jsonwebtoken";
import { HttpError } from "../lib/http.js";

export function verifyJWT(req, _res, next) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return next(new HttpError(401, "Authentication required."));

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return next(new HttpError(401, "Your session is invalid or has expired."));
  }
}

export function isAdmin(req, _res, next) {
  if (req.user?.role !== "ADMIN") {
    return next(new HttpError(403, "Administrator access is required."));
  }
  return next();
}
