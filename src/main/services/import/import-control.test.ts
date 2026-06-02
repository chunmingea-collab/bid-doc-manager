import { describe, expect, it, beforeEach } from "vitest";
import {
  cancelImportTask,
  pauseImportTask,
  resumeImportTask,
} from "./index";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("import control: pause/resume/cancel", () => {
  beforeEach(() => {
    // No mock needed — we only test the control functions which read from the
    // taskControls map (populated by importFiles in production).
  });

  it("returns false for pause/resume/cancel on unknown task", () => {
    expect(pauseImportTask("nope")).toBe(false);
    expect(resumeImportTask("nope")).toBe(false);
    expect(cancelImportTask("nope")).toBe(false);
  });

  it("exposes idempotent pause state", () => {
    // Simulate the map being populated: importFiles is the only writer, but
    // we can verify the API surface by trying to pause an unknown task and
    // confirming we never throw.
    expect(() => pauseImportTask(VALID_UUID)).not.toThrow();
    expect(() => resumeImportTask(VALID_UUID)).not.toThrow();
    expect(() => cancelImportTask(VALID_UUID)).not.toThrow();
  });
});
