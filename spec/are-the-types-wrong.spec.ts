import execa from "execa";
import { describe, it } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("package.json types exports", () => {
  it("should have the correct types exports", async () => {
    await execa("pnpm", ["exec", "attw", "--pack", "."], { cwd: path.resolve(__dirname, "..") });
  });
});
