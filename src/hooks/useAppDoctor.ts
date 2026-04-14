import { useContext } from "react";
import type { AppDoctorClient } from "../core/client.js";
import { AppDoctorContext } from "../provider/context.js";

export function useAppDoctor(): AppDoctorClient {
  const client = useContext(AppDoctorContext);
  if (!client) {
    throw new Error("useAppDoctor must be used within AppDoctorProvider");
  }
  return client;
}
