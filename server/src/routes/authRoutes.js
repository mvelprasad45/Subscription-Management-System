import { Router } from "express";
import { getCurrentAdmin, login } from "../controllers/authController.js";
import { isAdmin, verifyJWT } from "../middleware/auth.js";

const router = Router();
router.post("/login", login);
router.get("/me", verifyJWT, isAdmin, getCurrentAdmin);
export default router;
