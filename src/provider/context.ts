import { createContext } from "react";
import type { AppDoctorClient } from "../core/client.js";

export const AppDoctorContext = createContext<AppDoctorClient | null>(null);
