import { parseWorkerEnvironment } from "@kairn/backend";

const { NODE_ENV } = parseWorkerEnvironment(process.env);
console.log(`Kairn worker scaffold initialized (${NODE_ENV}).`);
