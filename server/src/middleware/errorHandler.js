import { ZodError } from "zod";
import { HttpError } from "../lib/http.js";

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Please check the submitted information.",
      errors: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  if (error?.code === "P2025") {
    return res.status(404).json({ success: false, message: "The requested record was not found." });
  }

  if (error?.code === "P2003" || error?.code === "P2002") {
    return res.status(400).json({
      success: false,
      message: "The request conflicts with an existing record or reference.",
    });
  }

  console.error("Unhandled API error:", error);
  return res.status(500).json({ success: false, message: "An unexpected server error occurred." });
}
