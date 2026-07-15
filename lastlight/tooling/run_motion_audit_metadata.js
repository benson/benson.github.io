import { assertMotionAuditMetadata, buildMotionAuditMetadata } from "../motion-audit.js";

const report = buildMotionAuditMetadata();
const errors = assertMotionAuditMetadata(report);
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
