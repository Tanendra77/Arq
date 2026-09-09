import { z } from "zod";

export const Id = z.string().min(1).regex(/^[A-Za-z0-9_.:-]+$/, "id may contain letters, digits, _ . : -");
export const IconId = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, "icon id must be category/slug");
