import { getStatusStyle } from "../../src/utils/documentUtils";
import { formatBytes } from "../../src/utils/format";
import { cn } from "../../src/utils/cn";

describe("utility helpers", () => {
  describe("cn", () => {
    it("merges tailwind classes predictably", () => {
      const value = cn("p-2", "text-sm", "p-4", ["font-semibold"], {
        hidden: false,
      });

      expect(value).toContain("p-4");
      expect(value).toContain("text-sm");
      expect(value).toContain("font-semibold");
      expect(value).not.toContain("p-2");
    });
  });

  describe("formatBytes", () => {
    it("formats bytes with correct units", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1024 * 1024, 2)).toBe("1 MB");
    });
  });

  describe("getStatusStyle", () => {
    it.each([
      ["COMPLETED", "Processed", "checkmark-circle"],
      ["PROCESSING", "Processing", "sync"],
      ["FAILED", "Failed", "alert-circle"],
      ["SOMETHING_ELSE", "Pending", "time"],
    ])(
      "returns style metadata for %s",
      (status: string, expectedLabel: string, expectedIcon: string) => {
        const style = getStatusStyle(status);
        expect(style.label).toBe(expectedLabel);
        expect(style.icon).toBe(expectedIcon);
        expect(style.container).toContain("bg-");
        expect(style.text).toContain("text-");
      },
    );
  });
});
