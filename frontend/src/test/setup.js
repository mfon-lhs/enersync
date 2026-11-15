// Runs once before every test file.
import "@testing-library/jest-dom/vitest"; // adds checks such as toBeDisabled() and toHaveFocus()
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup(); // removes whatever the test drew, so tests cannot affect each other
  try {
    sessionStorage.clear();
  } catch {
    /* a test replaced sessionStorage on purpose */
  }
  document.body.style.overflow = "";
});
