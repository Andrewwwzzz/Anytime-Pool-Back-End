import express from "express";
import { singpassLogin } from "../controllers/auth.controller.js";

const router = express.Router();

// Start Singpass login
router.get("/singpass", singpassLogin);

export default router;
