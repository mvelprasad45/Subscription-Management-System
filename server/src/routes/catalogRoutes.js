import { Router } from "express";
import {
  createTemplate, deleteTemplate, listTaxes, listTemplates, updateTemplate,
} from "../controllers/catalogController.js";

export const taxRouter = Router();
taxRouter.get("/", listTaxes);

export const templateRouter = Router();
templateRouter.get("/", listTemplates);
templateRouter.post("/", createTemplate);
templateRouter.put("/:id", updateTemplate);
templateRouter.delete("/:id", deleteTemplate);
