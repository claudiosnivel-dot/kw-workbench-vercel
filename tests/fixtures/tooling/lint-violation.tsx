// Fixture di T-102: viola react-hooks/rules-of-hooks (hook chiamato dentro un if).
// Esclusa dal lint e dal typecheck del repo; la usa tests/tooling/lint-typecheck.test.ts.
import { useState } from "react";

export function LintViolation({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [value] = useState(0);
    return <span>{value}</span>;
  }
  return null;
}
