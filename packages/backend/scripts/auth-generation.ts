import { betterAuth } from "better-auth";
import { authOptions } from "../src/modules/identity/auth-options.js";

export default betterAuth({ ...authOptions, baseURL: "http://localhost" });
